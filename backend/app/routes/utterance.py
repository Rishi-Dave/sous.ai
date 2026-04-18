from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from gemini_client import Intent, ParsedIngredient
from supabase import Client

from app.deps import get_db, get_gemini_client
from app.schemas.utterance import UtteranceResponse

router = APIRouter()


def _db_row_to_ingredient(row: dict) -> ParsedIngredient:
    return ParsedIngredient(
        name=row["name"],
        qty=row["qty"],
        unit=row["unit"],
        raw_phrase=row["raw_phrase"],
    )


@router.post("/utterance", response_model=UtteranceResponse)
async def process_utterance_endpoint(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    gemini=Depends(get_gemini_client),
    db: Client = Depends(get_db),
) -> UtteranceResponse:
    recipe_resp = db.table("recipes").select("pending_clarification").eq("recipe_id", session_id).maybe_single().execute()
    if not recipe_resp.data:
        raise HTTPException(status_code=404, detail="Session not found")
    pending_clarification: str | None = recipe_resp.data.get("pending_clarification")

    ingredients_resp = db.table("ingredients").select("*").eq("recipe_id", session_id).execute()
    session_ingredients = [_db_row_to_ingredient(r) for r in (ingredients_resp.data or [])]

    audio_bytes = await audio.read()
    result = await gemini(audio_bytes, session_ingredients, pending_clarification)

    if result.intent == Intent.add_ingredient and result.items:
        rows = [
            {
                "recipe_id": session_id,
                "name": item.name,
                "qty": item.qty,
                "unit": item.unit,
                "raw_phrase": item.raw_phrase,
            }
            for item in result.items
        ]
        db.table("ingredients").insert(rows).execute()
        db.table("recipes").update({"pending_clarification": None}).eq("recipe_id", session_id).execute()
    elif result.intent == Intent.question:
        db.table("recipes").update({"pending_clarification": result.answer}).eq("recipe_id", session_id).execute()
    else:
        if pending_clarification:
            db.table("recipes").update({"pending_clarification": None}).eq("recipe_id", session_id).execute()

    current_resp = db.table("ingredients").select("*").eq("recipe_id", session_id).execute()
    current_ingredients = [_db_row_to_ingredient(r) for r in (current_resp.data or [])]

    return UtteranceResponse(
        intent=result.intent,
        ack_audio_url="/static/ack-stub.mp3",
        items=result.items,
        answer=result.answer,
        current_ingredients=current_ingredients,
    )
