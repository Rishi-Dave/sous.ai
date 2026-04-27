"""Shared handler types."""

from dataclasses import dataclass

from ..schemas import ParsedIngredient


@dataclass(frozen=True)
class HandlerInput:
    transcript: str
    context_str: str
    pending_clarification: str | None
    session_ingredients: list[ParsedIngredient]
