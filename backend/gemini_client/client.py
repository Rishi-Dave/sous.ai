"""Orchestration entry point for utterance processing.

Receives raw audio (or text), classifies the mode via the hybrid router,
dispatches to the matching handler, post-processes the response, and
returns an UtteranceResponse for the FastAPI utterance route.

If the router self-reports confidence below the configured threshold,
this layer short-circuits the handler call and returns a disambiguation
question ("Did you mean to add an ingredient or ask a question?")
instead of guessing. The route layer detects the response's
`disambiguation` field and persists the pending state.
"""

import logging

from dotenv import find_dotenv, load_dotenv

from . import _groq, config, postprocess, router
from .context import assemble_context
from .handlers import HANDLERS, HandlerInput
from .router import Mode
from .schemas import Disambiguation, Intent, ParsedIngredient, UtteranceResponse

log = logging.getLogger(__name__)

load_dotenv(find_dotenv())


_MODE_LABELS: dict[Mode, str] = {
    Mode.freestyle: "add an ingredient",
    Mode.qa: "ask a cooking question",
    Mode.small_talk: "just chat",
    Mode.recipe: "follow a recipe",
}


def _compose_router_disambig(best: Mode, second: Mode) -> str:
    return f"Did you mean to {_MODE_LABELS[best]} or {_MODE_LABELS[second]}?"


def _log_low_confidence(transcript: str, source: str, confidence: float, best: str, second: str | None) -> None:
    log.info(
        "low_confidence_event | source=%s transcript=%r confidence=%.3f best=%s second=%s",
        source,
        transcript,
        confidence,
        best,
        second,
    )


async def process_utterance(
    audio_bytes: bytes,
    session_ingredients: list[ParsedIngredient],
    pending_clarification: str | None,
) -> UtteranceResponse:
    try:
        spoken_text = audio_bytes.decode("utf-8")
    except UnicodeDecodeError:
        spoken_text = await _groq.transcribe(audio_bytes)

    classification = await router.classify(
        transcript=spoken_text,
        session_ingredients=session_ingredients,
        pending_clarification=pending_clarification,
    )
    log.info(
        "router | mode=%s confidence=%s source=%s second=%s transcript=%r",
        classification.mode.value,
        classification.confidence,
        classification.source,
        classification.second_choice.value if classification.second_choice else None,
        spoken_text,
    )

    # Router-level disambiguation: if the LLM router was below threshold and
    # named a runner-up, ask the user to choose instead of dispatching the
    # wrong handler. Heuristic short-circuits (confidence=None) skip this.
    if (
        classification.source == "llm"
        and classification.confidence is not None
        and classification.confidence < config.ROUTER_CONFIDENCE_THRESHOLD
        and classification.second_choice is not None
    ):
        question = _compose_router_disambig(classification.mode, classification.second_choice)
        _log_low_confidence(
            spoken_text,
            "router_llm",
            classification.confidence,
            classification.mode.value,
            classification.second_choice.value,
        )
        return UtteranceResponse(
            intent=Intent.acknowledgment,
            ack=question,
            confidence=classification.confidence,
            source="router_llm",
            disambiguation=Disambiguation(
                kind="router",
                best=classification.mode.value,
                second=classification.second_choice.value,
            ),
        )

    handler_input = HandlerInput(
        transcript=spoken_text,
        context_str=assemble_context(session_ingredients, pending_clarification),
        pending_clarification=pending_clarification,
        session_ingredients=session_ingredients,
    )

    parsed = await HANDLERS[classification.mode](handler_input)
    postprocess.apply(parsed)
    response = UtteranceResponse.model_validate(parsed)

    # Surface low-confidence handler events to the structured log so they're
    # reviewable independent of whether the handler itself opted to compose
    # a disambiguation question (commit 6 wires that on freestyle).
    if (
        response.confidence is not None
        and response.confidence < config.FREESTYLE_CONFIDENCE_THRESHOLD
        and response.source == "freestyle_llm"
    ):
        best = response.disambiguation.best if response.disambiguation else response.intent.value
        second = response.disambiguation.second if response.disambiguation else None
        _log_low_confidence(spoken_text, response.source, response.confidence, best, second)

    return response
