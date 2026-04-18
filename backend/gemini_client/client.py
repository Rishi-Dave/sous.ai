"""Hour-0 stub. Returns a hardcoded ADD_INGREDIENT response for olive oil.

Replaced by Atharva with the real Gemini 2.5 Flash call by hour ~8.
Do not elaborate this stub from the backend side.
"""

from .schemas import Intent, ParsedIngredient, UtteranceResponse


async def process_utterance(
    audio_bytes: bytes,
    session_ingredients: list[ParsedIngredient],
    pending_clarification: str | None,
) -> UtteranceResponse:
    return UtteranceResponse(
        intent=Intent.add_ingredient,
        ack="Got it, olive oil.",
        items=[
            ParsedIngredient(
                name="olive oil",
                qty=1,
                unit="tsp",
                raw_phrase="a splash of olive oil",
            )
        ],
    )
