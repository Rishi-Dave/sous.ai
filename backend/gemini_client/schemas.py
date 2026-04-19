from enum import StrEnum

from pydantic import BaseModel, Field


class Intent(StrEnum):
    add_ingredient = "add_ingredient"
    question = "question"
    acknowledgment = "acknowledgment"
    small_talk = "small_talk"
    finish_recipe = "finish_recipe"


class ParsedIngredient(BaseModel):
    name: str
    qty: float | None = None
    unit: str | None = None
    raw_phrase: str


class UtteranceResponse(BaseModel):
    intent: Intent
    ack: str = Field(..., description="Spoken acknowledgement, <=12 words.")
    items: list[ParsedIngredient] | None = None
    answer: str | None = None
