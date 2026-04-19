"""Nutrition analysis via Edamam Nutrition Analysis API."""

import logging

import httpx

from app.config import Settings
from app.schemas.finalize import MacroLog

log = logging.getLogger(__name__)

_EDAMAM_URL = "https://api.edamam.com/api/nutrition-data"


async def _fetch_ingredient(client: httpx.AsyncClient, phrase: str, settings: Settings) -> dict | None:
    """Fetch macros for one ingredient phrase. Returns None on any failure."""
    try:
        resp = await client.get(
            _EDAMAM_URL,
            params={
                "app_id": settings.edamam_app_id,
                "app_key": settings.edamam_app_key,
                "ingr": phrase,
                "nutrition-type": "logging",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        nutrients = data["ingredients"][0]["parsed"][0]["nutrients"]

        def _qty(key: str) -> float:
            return round(nutrients.get(key, {}).get("quantity", 0), 1)

        return {
            "calories": round(_qty("ENERC_KCAL")),
            "protein_g": _qty("PROCNT"),
            "fat_g": _qty("FAT"),
            "carbs_g": _qty("CHOCDF"),
        }
    except Exception as exc:
        log.warning("edamam: skipping %r — %s", phrase, exc)
        return None


async def analyze(ingredients: list, settings: Settings) -> MacroLog:
    """Call Edamam for each ingredient; skip failures, aggregate totals."""
    if not settings.edamam_app_id or not settings.edamam_app_key:
        log.warning("edamam: no credentials — returning zero macros")
        return MacroLog(calories=0, protein_g=0, fat_g=0, carbs_g=0, per_ingredient={})

    per_ingredient: dict = {}
    totals = {"calories": 0.0, "protein_g": 0.0, "fat_g": 0.0, "carbs_g": 0.0}

    async with httpx.AsyncClient(timeout=10.0) as client:
        for ing in ingredients:
            phrase = f"{ing.qty} {ing.unit} {ing.name}".strip() if ing.qty else ing.name
            result = await _fetch_ingredient(client, phrase, settings)
            if result is None:
                continue
            per_ingredient[ing.name] = result
            for key in totals:
                totals[key] += result[key]

    return MacroLog(
        calories=round(totals["calories"]),
        protein_g=round(totals["protein_g"], 1),
        fat_g=round(totals["fat_g"], 1),
        carbs_g=round(totals["carbs_g"], 1),
        per_ingredient=per_ingredient,
    )
