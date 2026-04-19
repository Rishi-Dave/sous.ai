from typing import Any

from pydantic import BaseModel, Field

from gemini_client import ParsedIngredient


class MacroLog(BaseModel):
    calories: float
    protein_g: float
    fat_g: float
    carbs_g: float
    per_ingredient: dict[str, Any] = Field(default_factory=dict)


class FinalizeRequest(BaseModel):
    session_id: str
    recipe_name: str
    cook_time_seconds: int | None = None


class FinalizeResponse(BaseModel):
    recipe_id: str
    macros: MacroLog
    ingredients: list[ParsedIngredient]
    cook_time_seconds: int | None = None
