from pydantic import BaseModel

from gemini_client import Intent, ParsedIngredient


class UtteranceResponse(BaseModel):
    intent: Intent
    ack_audio_url: str
    items: list[ParsedIngredient] | None = None
    answer: str | None = None
    current_ingredients: list[ParsedIngredient]
    awaiting_clarification: bool = False
