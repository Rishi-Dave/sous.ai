"""Mode classification — hybrid heuristic + LLM router.

classify() decides which handler will run. Heuristic fast-paths short-circuit
the cheap common cases (clarification reply, single-word ack, explicit
finish, recipe-mode session); everything else goes to a small Groq call
with a tight 4-way classification prompt.
"""

import logging
from enum import StrEnum
from pathlib import Path

from . import _groq
from .schemas import ParsedIngredient

log = logging.getLogger(__name__)


class Mode(StrEnum):
    freestyle = "freestyle"
    qa = "qa"
    small_talk = "small_talk"
    recipe = "recipe"


_PROMPT_PATH = Path(__file__).parent / "prompts" / "router.txt"
_ROUTER_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")


# Single-token / short-phrase acknowledgments that don't need an LLM hop.
_SHORT_ACKS = frozenset({
    "ok", "okay", "k", "got it", "sure", "yes", "yeah", "yep", "no", "nope",
    "thanks", "thank you", "cool", "great", "perfect", "alright", "right",
    "mhm", "uh huh", "uhhuh", "mmhmm", "you're welcome", "youre welcome",
})

# Explicit finish phrases — kept conservative. False positives here would
# misclassify add_ingredient or question utterances as freestyle/finish; the
# LLM router catches the rest.
_FINISH_PHRASES = frozenset({
    "i'm done", "im done", "all done", "we're done", "were done",
    "we're finished", "were finished", "i'm finished", "im finished",
    "that's everything", "thats everything", "that's all", "thats all",
    "finish the recipe", "finish recipe", "done cooking",
})


def _normalize(text: str) -> str:
    return text.strip().lower().rstrip(".!?,")


async def classify(
    transcript: str,
    session_ingredients: list[ParsedIngredient],
    pending_clarification: str | None,
    recipe_id: str | None = None,
) -> Mode:
    if pending_clarification is not None:
        return Mode.freestyle

    if recipe_id is not None:
        return Mode.recipe

    normalized = _normalize(transcript)

    if normalized in _FINISH_PHRASES:
        return Mode.freestyle

    if normalized in _SHORT_ACKS:
        return Mode.small_talk

    return await _llm_classify(transcript)


async def _llm_classify(transcript: str) -> Mode:
    messages: list[dict] = [
        {"role": "system", "content": _ROUTER_PROMPT},
        {"role": "user", "content": f'User said: "{transcript}"'},
    ]
    raw = await _groq.chat_with_tools(messages)
    parsed = _groq.extract_json(raw)
    mode_str = parsed.get("mode", "")
    try:
        return Mode(mode_str)
    except ValueError:
        log.warning("router returned unknown mode=%r; defaulting to freestyle", mode_str)
        return Mode.freestyle
