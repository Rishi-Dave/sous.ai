"""Mode classification — hybrid heuristic + LLM router.

classify() decides which handler will run. Heuristic fast-paths short-circuit
the cheap common cases (clarification reply, single-word ack, explicit
finish, recipe-mode session); everything else goes to a small Groq call
with a tight 4-way classification prompt.

The return type is `Classification` — it carries the chosen mode plus
self-reported confidence and the second-best mode when the LLM was used.
Heuristic short-circuits return confidence=None and source="heuristic".
The orchestrator uses this to decide whether to ask a disambiguation
question instead of dispatching the handler.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Literal

from . import _groq
from .schemas import ParsedIngredient

log = logging.getLogger(__name__)


class Mode(StrEnum):
    freestyle = "freestyle"
    qa = "qa"
    small_talk = "small_talk"
    recipe = "recipe"


@dataclass(frozen=True)
class Classification:
    mode: Mode
    confidence: float | None
    second_choice: Mode | None
    source: Literal["heuristic", "llm"]


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


def _heuristic(mode: Mode) -> Classification:
    return Classification(mode=mode, confidence=None, second_choice=None, source="heuristic")


async def classify(
    transcript: str,
    session_ingredients: list[ParsedIngredient],
    pending_clarification: str | None,
    recipe_id: str | None = None,
) -> Classification:
    if pending_clarification is not None:
        return _heuristic(Mode.freestyle)

    if recipe_id is not None:
        return _heuristic(Mode.recipe)

    normalized = _normalize(transcript)

    if normalized in _FINISH_PHRASES:
        return _heuristic(Mode.freestyle)

    if normalized in _SHORT_ACKS:
        return _heuristic(Mode.small_talk)

    return await _llm_classify(transcript)


def _parse_mode(value: object) -> Mode | None:
    if not isinstance(value, str):
        return None
    try:
        return Mode(value)
    except ValueError:
        return None


def _parse_confidence(value: object) -> float | None:
    try:
        f = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if not 0.0 <= f <= 1.0:
        return None
    return f


async def _llm_classify(transcript: str) -> Classification:
    messages: list[dict] = [
        {"role": "system", "content": _ROUTER_PROMPT},
        {"role": "user", "content": f'User said: "{transcript}"'},
    ]
    raw = await _groq.chat_with_tools(messages)
    parsed = _groq.extract_json(raw)

    mode = _parse_mode(parsed.get("mode"))
    if mode is None:
        log.warning("router returned unknown mode=%r; defaulting to freestyle", parsed.get("mode"))
        mode = Mode.freestyle

    raw_second = parsed.get("second_choice")
    second_choice = _parse_mode(raw_second)
    if raw_second is not None and second_choice is None:
        log.debug("router second_choice unparseable=%r — disambig will be skipped", raw_second)
    if second_choice == mode:
        second_choice = None

    confidence = _parse_confidence(parsed.get("confidence"))

    return Classification(
        mode=mode,
        confidence=confidence,
        second_choice=second_choice,
        source="llm",
    )
