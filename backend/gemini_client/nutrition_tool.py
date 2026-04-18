import json
import os

import httpx

EDAMAM_URL = "https://api.edamam.com/api/nutrition-data"

# Groq-compatible tool schema
NUTRITION_TOOL = {
    "type": "function",
    "function": {
        "name": "get_nutrition",
        "description": (
            "Look up nutritional info for a single ingredient phrase, "
            "e.g. '2 cups pasta' or '3 cloves garlic'. "
            "Returns calories, protein, fat, and carbs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "ingredient": {
                    "type": "string",
                    "description": "Ingredient phrase including quantity and unit if known.",
                }
            },
            "required": ["ingredient"],
        },
    },
}


async def fetch_nutrition(ingredient: str) -> dict:
    app_id = os.environ["EDAMAM_APP_ID"]
    app_key = os.environ["EDAMAM_APP_KEY"]
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            EDAMAM_URL,
            params={
                "app_id": app_id,
                "app_key": app_key,
                "ingr": ingredient,
                "nutrition-type": "logging",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    # Nutrients live under ingredients[0].parsed[0].nutrients with this API tier
    try:
        nutrients = data["ingredients"][0]["parsed"][0]["nutrients"]
    except (KeyError, IndexError):
        nutrients = {}

    def qty(key: str) -> float:
        return round(nutrients.get(key, {}).get("quantity", 0), 1)

    return {
        "ingredient": ingredient,
        "calories": round(qty("ENERC_KCAL")),
        "protein_g": qty("PROCNT"),
        "fat_g": qty("FAT"),
        "carbs_g": qty("CHOCDF"),
    }


async def dispatch_tool_call(name: str, arguments_json: str) -> str:
    if name == "get_nutrition":
        args = json.loads(arguments_json)
        result = await fetch_nutrition(args["ingredient"])
        return json.dumps(result)
    raise ValueError(f"Unknown tool: {name}")
