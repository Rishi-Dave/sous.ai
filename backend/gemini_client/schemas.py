from enum import StrEnum
from typing import Literal

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
    action: Literal["add", "replace"] = "add"


class UtteranceResponse(BaseModel):
    intent: Intent
    ack: str = Field(..., description="Spoken acknowledgement, <=12 words.")
    items: list[ParsedIngredient] | None = None
    answer: str | None = None

    # Internal-only fields (not propagated to mobile by the route layer).
    # `confidence` is the dominant model's self-reported 0.0-1.0 score for
    # this utterance; `source` identifies which subsystem produced it
    # (e.g. "freestyle_llm", "qa_llm", "small_talk_llm", "router_llm").
    # The route layer uses these for low-confidence routing and structured
    # logging; backend/app/schemas/utterance.py does NOT carry them.
    confidence: float | None = None
    source: str | None = None
