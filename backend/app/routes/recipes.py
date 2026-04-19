from fastapi import APIRouter, Depends, HTTPException
from gemini_client import ParsedIngredient
from supabase import Client

from app.deps import get_db
from app.schemas.finalize import FinalizeResponse, MacroLog

router = APIRouter()


@router.get("/recipes/{recipe_id}", response_model=FinalizeResponse)
def get_recipe(recipe_id: str, db: Client = Depends(get_db)) -> FinalizeResponse:
    recipe_resp = (
        db.table("recipes")
        .select("recipe_id, cook_time_seconds")
        .eq("recipe_id", recipe_id)
        .maybe_single()
        .execute()
    )
    if not recipe_resp or not recipe_resp.data:
        raise HTTPException(status_code=404, detail="Recipe not found")
    cook_time = recipe_resp.data.get("cook_time_seconds")

    ingredients_resp = db.table("ingredients").select("*").eq("recipe_id", recipe_id).execute()
    ingredients = [
        ParsedIngredient(
            name=r["name"],
            qty=r["qty"],
            unit=r["unit"],
            raw_phrase=r["raw_phrase"],
        )
        for r in (ingredients_resp.data or [])
    ]

    macros_resp = db.table("macro_logs").select("*").eq("recipe_id", recipe_id).maybe_single().execute()
    if macros_resp and macros_resp.data:
        m = macros_resp.data
        macros = MacroLog(
            calories=m["calories"],
            protein_g=m["protein_g"],
            fat_g=m["fat_g"],
            carbs_g=m["carbs_g"],
            per_ingredient=m["per_ingredient"],
        )
    else:
        macros = MacroLog(calories=0, protein_g=0, fat_g=0, carbs_g=0, per_ingredient={})

    return FinalizeResponse(
        recipe_id=recipe_id,
        macros=macros,
        ingredients=ingredients,
        cook_time_seconds=cook_time,
    )
