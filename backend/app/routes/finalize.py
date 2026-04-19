from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from gemini_client import ParsedIngredient
from supabase import Client

from app.deps import get_db
from app.schemas.finalize import FinalizeRequest, FinalizeResponse, MacroLog

router = APIRouter()


@router.post("/finalize", response_model=FinalizeResponse)
def finalize_session(req: FinalizeRequest, db: Client = Depends(get_db)) -> FinalizeResponse:
    recipe_resp = db.table("recipes").select("recipe_id").eq("recipe_id", req.session_id).maybe_single().execute()
    if not recipe_resp.data:
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

    # Macros stubbed at 0 — Edamam wiring is M5
    stub_macros = MacroLog(calories=0, protein_g=0, fat_g=0, carbs_g=0, per_ingredient={})

    db.table("macro_logs").upsert({
        "recipe_id": req.session_id,
        "calories": stub_macros.calories,
        "protein_g": stub_macros.protein_g,
        "fat_g": stub_macros.fat_g,
        "carbs_g": stub_macros.carbs_g,
        "per_ingredient": stub_macros.per_ingredient,
    }).execute()

    db.table("recipes").update({
        "status": "finalized",
        "recipe_name": req.recipe_name,
        "finalized_at": datetime.now(timezone.utc).isoformat(),
    }).eq("recipe_id", req.session_id).execute()

    return FinalizeResponse(
        recipe_id=req.session_id,
        macros=stub_macros,
        ingredients=ingredients,
    )
