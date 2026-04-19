"""Nutrition analysis via Edamam, with LLM estimation fallback."""

import json
import logging

import httpx
from groq import AsyncGroq

from app.config import Settings
from app.schemas.finalize import MacroLog

log = logging.getLogger(__name__)

_EDAMAM_URL = "https://api.edamam.com/api/nutrition-data"

_ESTIMATE_PROMPT = """\
Estimate the nutritional content for this ingredient phrase: {phrase}

Return ONLY a valid JSON object with these exact keys — no markdown, no explanation:
{{"calories": <integer>, "protein_g": <float>, "fat_g": <float>, "carbs_g": <float>}}

Base your estimate on standard USDA/nutrition database values for typical culinary use."""


async def _fetch_ingredient(client: httpx.AsyncClient, phrase: str, settings: Settings) -> dict | None:
    """Fetch macros for one ingredient phrase via Edamam. Returns None on any failure."""
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
        log.warning("edamam: no result for %r — %s", phrase, exc)
        return None


async def _estimate_ingredient(groq: AsyncGroq, phrase: str) -> dict | None:
    """LLM fallback: estimate macros for a phrase Edamam couldn't parse."""
    try:
        resp = await groq.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": _ESTIMATE_PROMPT.format(phrase=phrase)}],
            temperature=0.1,
        )
        raw = resp.choices[0].message.content
        start, end = raw.index("{"), raw.rindex("}") + 1
        data = json.loads(raw[start:end])
        return {
            "calories": round(float(data["calories"])),
            "protein_g": round(float(data["protein_g"]), 1),
            "fat_g": round(float(data["fat_g"]), 1),
            "carbs_g": round(float(data["carbs_g"]), 1),
            "estimated": True,
        }
    except Exception as exc:
        log.warning("llm estimate: failed for %r — %s", phrase, exc)
        return None


async def analyze(ingredients: list, settings: Settings) -> MacroLog:
    """Edamam per-ingredient, LLM fallback for any Edamam miss, aggregate totals."""
    groq = AsyncGroq(api_key=settings.groq_api_key) if settings.groq_api_key else None

    per_ingredient: dict = {}
    totals = {"calories": 0.0, "protein_g": 0.0, "fat_g": 0.0, "carbs_g": 0.0}

    edamam_available = bool(settings.edamam_app_id and settings.edamam_app_key)

    async with httpx.AsyncClient(timeout=10.0) as http:
        for ing in ingredients:
            phrase = f"{ing.qty} {ing.unit} {ing.name}".strip() if ing.qty else ing.name

            result = await _fetch_ingredient(http, phrase, settings) if edamam_available else None

            if result is None and groq is not None:
                log.info("nutrition: estimating %r via LLM", phrase)
                result = await _estimate_ingredient(groq, phrase)

            if result is None:
                log.warning("nutrition: no data for %r — skipping", phrase)
                continue

            per_ingredient[ing.name] = result
            for key in ("calories", "protein_g", "fat_g", "carbs_g"):
                totals[key] += result[key]

    return MacroLog(
        calories=round(totals["calories"]),
        protein_g=round(totals["protein_g"], 1),
        fat_g=round(totals["fat_g"], 1),
        carbs_g=round(totals["carbs_g"], 1),
        per_ingredient=per_ingredient,
    )
