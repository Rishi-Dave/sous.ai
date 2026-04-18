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
            params={"app_id": app_id, "app_key": app_key, "ingr": ingredient},
        )
        resp.raise_for_status()
        data = resp.json()

    nutrients = data.get("totalNutrients", {})
    return {
        "ingredient": ingredient,
        "calories": data.get("calories", 0),
        "protein_g": round(nutrients.get("PROCNT", {}).get("quantity", 0), 1),
        "fat_g": round(nutrients.get("FAT", {}).get("quantity", 0), 1),
        "carbs_g": round(nutrients.get("CHOCDF", {}).get("quantity", 0), 1),
    }


async def dispatch_tool_call(name: str, arguments_json: str) -> str:
    if name == "get_nutrition":
        args = json.loads(arguments_json)
        result = await fetch_nutrition(args["ingredient"])
        return json.dumps(result)
    raise ValueError(f"Unknown tool: {name}")
