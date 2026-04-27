"""Orchestration entry point for utterance processing.

Receives raw audio (or text), assembles context, dispatches to the
freestyle handler (router and full Mode-keyed dispatch land in the next
commit), post-processes the response, and returns an UtteranceResponse
for the FastAPI utterance route.
"""

import logging

from dotenv import find_dotenv, load_dotenv

from . import _groq, postprocess
from .context import assemble_context
from .handlers import HandlerInput, freestyle
from .schemas import ParsedIngredient, UtteranceResponse

log = logging.getLogger(__name__)

load_dotenv(find_dotenv())


async def process_utterance(
    audio_bytes: bytes,
    session_ingredients: list[ParsedIngredient],
    pending_clarification: str | None,
) -> UtteranceResponse:
    try:
        spoken_text = audio_bytes.decode("utf-8")
    except UnicodeDecodeError:
        spoken_text = await _groq.transcribe(audio_bytes)

    handler_input = HandlerInput(
        transcript=spoken_text,
        context_str=assemble_context(session_ingredients, pending_clarification),
        pending_clarification=pending_clarification,
        session_ingredients=session_ingredients,
    )

    parsed = await freestyle.handle(handler_input)
    postprocess.apply(parsed)
    return UtteranceResponse.model_validate(parsed)
