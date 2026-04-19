from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from gemini_client import ParsedIngredient
from supabase import Client

from app.config import Settings
from app.deps import get_db, get_settings
from app.nutrition import analyze
from app.schemas.finalize import FinalizeRequest, FinalizeResponse

router = APIRouter()


@router.post("/finalize", response_model=FinalizeResponse)
async def finalize_session(
    req: FinalizeRequest,
    db: Client = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> FinalizeResponse:
    recipe_resp = db.table("recipes").select("recipe_id").eq("recipe_id", req.session_id).maybe_single().execute()
    if not recipe_resp or not recipe_resp.data:
        raise HTTPException(status_code=404, detail="Session not found")

    ingredients_resp = db.table("ingredients").select("*").eq("recipe_id", req.session_id).execute()
    ingredients = [
        ParsedIngredient(
            name=r["name"],
            qty=r["qty"],
            unit=r["unit"],
            raw_phrase=r["raw_phrase"],
        )
        for r in (ingredients_resp.data or [])
    ]

    macros = await analyze(ingredients, settings)

    db.table("macro_logs").upsert({
        "recipe_id": req.session_id,
        "calories": macros.calories,
        "protein_g": macros.protein_g,
        "fat_g": macros.fat_g,
        "carbs_g": macros.carbs_g,
        "per_ingredient": macros.per_ingredient,
    }).execute()

    db.table("recipes").update({
        "status": "finalized",
        "recipe_name": req.recipe_name,
        "finalized_at": datetime.now(timezone.utc).isoformat(),
    }).eq("recipe_id", req.session_id).execute()

    return FinalizeResponse(
        recipe_id=req.session_id,
        macros=macros,
        ingredients=ingredients,
    )
