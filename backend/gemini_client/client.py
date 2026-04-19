import asyncio
import json
import logging
import os

from dotenv import find_dotenv, load_dotenv
from groq import AsyncGroq, RateLimitError

from .nutrition_tool import NUTRITION_TOOL, dispatch_tool_call
from .schemas import ParsedIngredient, UtteranceResponse

log = logging.getLogger(__name__)

load_dotenv(find_dotenv())

_SYSTEM_PROMPT = """You are a voice-controlled cooking assistant. The user is cooking hands-free and speaks to you.

If the transcript begins with a wake greeting (e.g. "Hey Sous", "Hey Chef"), ignore it for intent classification and parse only what the user said after that greeting.

Classify the utterance and return ONLY a valid JSON object — no markdown, no explanation, no extra text before or after.

Schema:
{
  "intent": <"add_ingredient" | "question" | "acknowledgment" | "small_talk" | "finish_recipe">,
  "ack": <string, spoken acknowledgement, HARD LIMIT 12 words — count carefully>,
  "items": <list of ingredient objects, or null>,
  "answer": <string or null>
}

Each item in "items":
{
  "name": <string>,
  "qty": <float or null>,
  "unit": <string, ALWAYS singular — "clove" not "cloves", "cup" not "cups", "gram" not "grams", "slice" not "slices", "tsp" not "tsps", "tbsp" not "tbsps">,
  "raw_phrase": <exact words user said for this ingredient>,
  "action": <"add" | "replace">
}

## action rules
- "action": "add"     — default. Use when the user is adding a new ingredient OR adding MORE of an existing one ("add more garlic", "another splash of olive oil", "also add 2 cloves").
- "action": "replace" — use when the user explicitly wants to change or correct the total amount of an ingredient already listed ("change garlic to 4 cloves", "actually use 3 tbsp olive oil", "make it 100 grams pasta", "update the salt to 1 tsp").
- When "Ingredients added so far" is empty, always use "add".

## Intent rules
- add_ingredient: user is adding an ingredient to their recipe
- question: user asks a cooking question
- acknowledgment: user says ok / got it / sure / yes / no / thanks
- small_talk: compliments, observations, anything else
- finish_recipe: user signals they are done cooking — phrases like "I'm done", "all done", "that's everything", "finish the recipe", "we're finished", "done cooking", "that's all the ingredients"

## Vague quantity normalisation (apply exactly)
- "a splash"   → qty=1.0,   unit="tsp"
- "a pinch"    → qty=0.125, unit="tsp"
- "a dash"     → qty=0.5,   unit="tsp"
- "a drizzle"  → qty=1.0,   unit="tbsp"
- "a handful"  → qty=0.5,   unit="cup"
- "to taste"   → qty=null,  unit=null
- "some X"     → qty=null,  unit=null

## ITEMS RULE — ABSOLUTE (no exceptions)
When intent is add_ingredient:
  - items MUST be a non-empty list. NEVER null. NEVER empty.
  - Include EVERY ingredient the user mentioned.
  - If qty is unknown/vague, still include the item with qty=null.
  - "add some salt" → items=[{name:"salt", qty:null, unit:null, raw_phrase:"some salt"}]
  - "add garlic" → items=[{name:"garlic", qty:null, unit:null, raw_phrase:"garlic"}]

When intent is NOT add_ingredient:
  - items MUST be null.

When intent is finish_recipe:
  - items MUST be null.
  - answer MUST be null.

## ack rules (HARD LIMIT: ≤12 words, spoken aloud — count every word)
- add_ingredient with qty: confirm e.g. "Got it, two cloves of garlic." (7 words ✓)
- add_ingredient with qty=null: add the item to items AND ask qty in ack. Phrase it as: "How much [ingredient] would you like to add?" e.g. "How much garlic would you like to add?" (8 words ✓)
- add_ingredient, multiple items: summarise e.g. "Got it, three ingredients added." (5 words ✓)
- question: short preview e.g. "Boil for 8 to 10 minutes." (6 words ✓)
- acknowledgment / small_talk: short friendly reply e.g. "You're welcome!" (2 words ✓)
- finish_recipe: confirm wrap-up e.g. "Got it, calculating your nutrition summary!" (≤12 words ✓)

## answer (question intent only)
- MUST be populated when intent is question. 1-2 sentences of practical cooking advice.
- null for all other intents.

## Clarification replies (qty or unit was missing from a previous utterance)
When context says 'You previously asked the user: "How much X ..."' you are waiting
for the user to give a quantity for that ingredient. Their next utterance is the answer.
- Parse the qty from their reply. Return intent=add_ingredient with items containing
  the same ingredient name, the parsed qty, and the parsed unit.
- If the user is uncertain ("I don't know", "not sure", "maybe", "I guess", no number):
  choose a sensible culinary default (e.g. garlic→2 cloves, olive oil→2 tbsp,
  salt→0.5 tsp, onion→1 medium, pasta→100 grams). Include it in items with that
  estimated qty. Do NOT return qty=null. Ack should reflect the estimate, e.g.
  "I'll use 2 cloves, a typical amount." (≤12 words)
- Once an ingredient is successfully added, the clarification exchange is over.
  Treat "Ingredients added so far" as the complete source of truth going forward.
  Do not reference or remember the prior clarification conversation.

Output ONLY the JSON object. Zero extra characters outside it."""

_client: AsyncGroq | None = None


def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=os.environ["GROQ_API_KEY"])
    return _client


def _build_context(
    session_ingredients: list[ParsedIngredient],
    pending_clarification: str | None,
) -> str:
    lines = []
    if session_ingredients:
        parts = []
        for i in session_ingredients:
            parts.append(f"{i.qty} {i.unit} {i.name}".strip() if i.qty else i.name)
        lines.append(f"Ingredients added so far: {', '.join(parts)}")
    if pending_clarification:
        lines.append(f'You previously asked the user: "{pending_clarification}" — their reply follows.')
    return "\n".join(lines)


_PLURAL_UNITS = {
    "cloves", "cups", "grams", "slices", "tsps", "tbsps",
    "ounces", "pounds", "liters", "milliliters", "pieces", "heads",
    "stalks", "leaves", "sprigs", "pinches", "dashes", "handfuls",
}

# Keyed on substrings of raw_phrase (lowercase). Applied after LLM response so
# tests are deterministic even when the model ignores the prompt table.
_VAGUE_QTY_MAP: list[tuple[str, float | None, str | None]] = [
    ("splash",  1.0,   "tsp"),
    ("pinch",   0.125, "tsp"),
    ("dash",    0.5,   "tsp"),
    ("drizzle", 1.0,   "tbsp"),
    ("handful", 0.5,   "cup"),
    ("to taste", None, None),
]


def _singularize_units(parsed: dict) -> None:
    """Strip plural 's' from unit fields the LLM returns despite the singular instruction."""
    for item in parsed.get("items") or []:
        unit = (item.get("unit") or "").strip().lower()
        if unit in _PLURAL_UNITS:
            item["unit"] = unit.rstrip("s")


def _normalize_vague_qty(parsed: dict) -> bool:
    """Apply the canonical vague-qty table to items whose raw_phrase contains a known phrase.

    Returns True if any item had its qty resolved from null to a concrete value."""
    resolved_any = False
    for item in parsed.get("items") or []:
        phrase = (item.get("raw_phrase") or "").lower()
        was_null = item.get("qty") is None
        for keyword, qty, unit in _VAGUE_QTY_MAP:
            if keyword in phrase:
                item["qty"] = qty
                item["unit"] = unit
                if was_null and qty is not None:
                    resolved_any = True
                break
    return resolved_any


async def _transcribe(client: AsyncGroq, audio_bytes: bytes) -> str:
    transcription = await client.audio.transcriptions.create(
        file=("audio.wav", audio_bytes, "audio/wav"),
        model="whisper-large-v3-turbo",
    )
    return transcription.text


async def process_utterance(
    audio_bytes: bytes,
    session_ingredients: list[ParsedIngredient],
    pending_clarification: str | None,
) -> UtteranceResponse:
    client = _get_client()
    context = _build_context(session_ingredients, pending_clarification)

    try:
        spoken_text = audio_bytes.decode("utf-8")
    except UnicodeDecodeError:
        spoken_text = await _transcribe(client, audio_bytes)

    user_msg = f'User said: "{spoken_text}"'
    if context:
        user_msg = f"{context}\n\n{user_msg}"

    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    log.info("groq input | messages=%s", json.dumps(messages, ensure_ascii=False))

    # Agentic loop: let Groq call get_nutrition if it needs macro data.
    for _ in range(5):
        for attempt in range(4):
            try:
                response = await client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=messages,
                    tools=[NUTRITION_TOOL],
                    tool_choice="auto",
                    temperature=0.1,
                )
                break
            except RateLimitError:
                if attempt == 3:
                    raise
                await asyncio.sleep(2 ** attempt)

        choice = response.choices[0]

        if choice.finish_reason == "tool_calls":
            assistant_msg = choice.message.model_dump(exclude_unset=True)
            messages.append(assistant_msg)
            for tc in choice.message.tool_calls:
                log.info(
                    "nutrition tool call | fn=%s args=%s",
                    tc.function.name,
                    tc.function.arguments,
                )
                result = await dispatch_tool_call(tc.function.name, tc.function.arguments)
                log.info(
                    "nutrition tool result | fn=%s result=%s",
                    tc.function.name,
                    result,
                )
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })
            continue

        raw = choice.message.content
        start = raw.index("{")
        end = raw.rindex("}") + 1
        parsed = json.loads(raw[start:end])
        _singularize_units(parsed)
        resolved_vague = _normalize_vague_qty(parsed)
        # LLM sometimes writes a clarification question for vague phrases it normalized —
        # replace the ack with a confirmation so TTS doesn't speak an unanswerable question.
        if resolved_vague and parsed.get("ack", "").rstrip().endswith("?"):
            items = parsed.get("items") or []
            phrase = items[0]["raw_phrase"] if items else "that"
            parsed["ack"] = f"Got it, adding {phrase}."
        return UtteranceResponse.model_validate(parsed)

    raise RuntimeError("Tool-call loop exceeded max iterations")
