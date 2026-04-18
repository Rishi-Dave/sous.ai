import json
import os

from dotenv import find_dotenv, load_dotenv
from groq import AsyncGroq

from .nutrition_tool import NUTRITION_TOOL, dispatch_tool_call
from .schemas import ParsedIngredient, UtteranceResponse

load_dotenv(find_dotenv())

_SYSTEM_PROMPT = """You are a voice-controlled cooking assistant. The user is cooking hands-free and speaks to you.

Classify the utterance and return a JSON object matching this exact schema:
{
  "intent": <"add_ingredient" | "question" | "acknowledgment" | "small_talk">,
  "ack": <string, spoken acknowledgement, MAX 12 words>,
  "items": <list of ingredients or null>,
  "answer": <string or null>
}

Each item in "items":
{
  "name": <string>,
  "qty": <float or null>,
  "unit": <string or null>,
  "raw_phrase": <exact words user said for this ingredient>
}

## Intent rules
- add_ingredient: user is adding an ingredient to their recipe
- question: user asks a cooking question
- acknowledgment: user says ok / got it / sure / yes / no / thanks
- small_talk: compliments, observations, anything else

## Vague quantity normalisation (apply exactly)
- "a splash"   → qty=1.0,   unit="tsp"
- "a pinch"    → qty=0.125, unit="tsp"
- "a dash"     → qty=0.5,   unit="tsp"
- "a drizzle"  → qty=1.0,   unit="tbsp"
- "a handful"  → qty=0.5,   unit="cup"
- "to taste"   → qty=null,  unit=null  ← still include the item in items list
- "some" alone → qty=null,  unit=null  ← still include the item in items list

## Unit format
Always use singular form. Examples: "clove" not "cloves", "cup" not "cups", "tsp" not "tsps", "tbsp" not "tbsps", "gram" not "grams", "slice" not "slices".

## ack rules (always ≤12 words — this is spoken aloud)
- add_ingredient, single item: confirm concisely e.g. "Got it, two cloves of garlic."
- add_ingredient, multiple items: summarise e.g. "Got it, three ingredients added." — never list all items.
- add_ingredient + qty null: ask how much e.g. "How much garlic would you like to add?"
- question: one-line preview of the answer e.g. "Boil for 8 to 10 minutes."
- acknowledgment / small_talk: short friendly reply

## answer (question intent only)
- MUST be populated whenever intent is question — never leave it null for a question.
- 1-2 sentences, practical cooking advice.
- The ack is just a preview; the full answer goes in the answer field.
- null for all other intents.

## items presence rule (critical)
- MUST be populated whenever intent is add_ingredient — even when qty is null.
- Every ingredient the user mentioned must appear in items, even with qty=null.
- Never return items=null when intent is add_ingredient.
- null for all other intents.

Return only the JSON object. No markdown, no explanation.
"""

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

    # Agentic loop: let Groq call get_nutrition if it needs macro data.
    for _ in range(5):
        response = await client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            tools=[NUTRITION_TOOL],
            tool_choice="auto",
            temperature=0.1,
        )
        choice = response.choices[0]

        if choice.finish_reason == "tool_calls":
            assistant_msg = choice.message.model_dump(exclude_unset=True)
            messages.append(assistant_msg)
            for tc in choice.message.tool_calls:
                result = await dispatch_tool_call(tc.function.name, tc.function.arguments)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })
            continue

        raw = choice.message.content
        return UtteranceResponse.model_validate(json.loads(raw))

    raise RuntimeError("Tool-call loop exceeded max iterations")
