"""Stub nutrition analysis. Real impl will call Edamam per-ingredient."""

from app.schemas.finalize import MacroLog


def analyze(ingredients: list) -> MacroLog:
    return MacroLog(
        calories=0,
        protein_g=0,
        fat_g=0,
        carbs_g=0,
        per_ingredient={},
    )
