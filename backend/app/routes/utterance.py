from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from gemini_client import Intent, ParsedIngredient
from supabase import Client

from app.deps import get_db, get_gemini_client,get_tts
import logging

from gemini_client import UtteranceResponse as GeminiUtteranceResponse

from app.schemas.utterance import UtteranceResponse
from app.tts import ElevenLabsTTS

logger = logging.getLogger(__name__)

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
    tts: ElevenLabsTTS = Depends(get_tts),
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

    # TODO(ad/gemini-fix): gemini_client currently crashes on some Groq outputs
    # (json.JSONDecodeError 'Extra data'). Catch + soft-fall so the demo loop stays
    # alive end-to-end. Drop once docs/notes/2026-04-18-gemini-client-json-extra-data.md
    # is resolved.
    try:
        result = await gemini(audio_bytes, [], None)
    except Exception as e:
        logger.warning("gemini_soft_fall: %s: %s", type(e).__name__, e)
        result = GeminiUtteranceResponse(
            intent=Intent.small_talk,
            ack="Okay.",
            items=None,
            answer=None,
        )

    # Design §8: for a question intent the `answer` is the spoken reply;
    # otherwise the `ack` is what the user hears. Fallback to a filler so we never
    # send an empty string to ElevenLabs (which 400s).
    picked = result.answer if result.intent == Intent.question and result.answer else result.ack
    tts_text = (picked or "").strip() or "Okay."
    audio_id = tts.stash_text(tts_text)

    return UtteranceResponse(
        intent=result.intent,
        ack_audio_url=f"/tts/stream/{audio_id}",
        items=result.items,
        answer=result.answer,
        current_ingredients=current_ingredients,
    )
