"""Recipe handler — STUB.

Reserves the routing slot for #25 (recipe-following mode). Returns a canned
response with intent=small_talk so the existing schema is preserved; no LLM
call is made.
"""

from .base import HandlerInput


async def handle(input: HandlerInput) -> dict:
    return {
        "intent": "small_talk",
        "ack": "Recipe mode coming soon.",
        "items": None,
        "answer": None,
    }
