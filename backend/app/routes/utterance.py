import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from gemini_client import Intent, ParsedIngredient
from gemini_client import UtteranceResponse as GeminiUtteranceResponse
from supabase import Client

from app.deps import get_db, get_gemini_client, get_tts
from app.schemas.utterance import UtteranceResponse
from app.tts import ElevenLabsTTS

logger = logging.getLogger(__name__)

router = APIRouter()

_INGREDIENT_PREFIX = "INGREDIENT_CLARIFICATION:"


def _encode_ingredient_clarification(name: str, question: str) -> str:
    return f"{_INGREDIENT_PREFIX}{name}|{question}"


def _decode_pending(pending: str | None) -> tuple[str, str | None]:
    if pending and pending.startswith(_INGREDIENT_PREFIX):
        body = pending[len(_INGREDIENT_PREFIX):]
        name, _, _ = body.partition("|")
        return "ingredient", name
    return "question", None


def _pending_display_text(pending: str) -> str:
    if pending.startswith(_INGREDIENT_PREFIX):
        _, _, question = pending.partition("|")
        return question
    return pending


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
    pending_kind, clarification_name = _decode_pending(pending_clarification)
    llm_pending = _pending_display_text(pending_clarification) if pending_clarification else None

    ingredients_resp = db.table("ingredients").select("*").eq("recipe_id", session_id).execute()
    session_ingredients = [_db_row_to_ingredient(r) for r in (ingredients_resp.data or [])]

    audio_bytes = await audio.read()

    try:
        result = await gemini(audio_bytes, session_ingredients, llm_pending)
    except Exception as e:
        logger.warning("gemini_soft_fall: %s: %s", type(e).__name__, e)
        result = GeminiUtteranceResponse(
            intent=Intent.small_talk,
            ack="Okay.",
            items=None,
            answer=None,
        )

    new_pending: str | None = None

    if result.intent == Intent.add_ingredient and result.items:
        is_resolving = pending_kind == "ingredient" and clarification_name is not None
        logger.info("clarification | is_resolving=%s clarification_name=%s", is_resolving, clarification_name)

        existing_names = {i.name.lower() for i in session_ingredients}

        for item in result.items:
            if is_resolving and item.name.lower() == clarification_name.lower():
                logger.info("clarification | resolving qty for '%s' → qty=%s unit=%s", item.name, item.qty, item.unit)
                db.table("ingredients") \
                    .update({"qty": item.qty, "unit": item.unit, "raw_phrase": item.raw_phrase}) \
                    .eq("recipe_id", session_id) \
                    .ilike("name", clarification_name) \
                    .is_("qty", "null") \
                    .execute()
            elif item.name.lower() in existing_names:
                existing = next(i for i in session_ingredients if i.name.lower() == item.name.lower())
                if item.action == "replace" or existing.qty is None or item.qty is None:
                    new_qty = item.qty
                else:
                    new_qty = existing.qty + item.qty
                logger.info("ingredient update | action=%s name='%s' existing_qty=%s new_qty=%s unit=%s", item.action, item.name, existing.qty, new_qty, item.unit)
                db.table("ingredients") \
                    .update({"qty": new_qty, "unit": item.unit, "raw_phrase": item.raw_phrase}) \
                    .eq("recipe_id", session_id) \
                    .ilike("name", item.name) \
                    .execute()
            else:
                logger.info("ingredient insert | name='%s' qty=%s unit=%s", item.name, item.qty, item.unit)
                db.table("ingredients").insert({
                    "recipe_id": session_id,
                    "name": item.name,
                    "qty": item.qty,
                    "unit": item.unit,
                    "raw_phrase": item.raw_phrase,
                }).execute()

        incomplete = [i for i in result.items if i.qty is None]
        if incomplete and not is_resolving:
            # Chain clarification for first incomplete item; subsequent null items chain naturally
            new_pending = _encode_ingredient_clarification(incomplete[0].name, result.ack)
            logger.info("clarification | asking for qty: ingredient='%s' ack='%s'", incomplete[0].name, result.ack)
        elif incomplete and is_resolving:
            # LLM failed to resolve — retry clarification for the same ingredient
            new_pending = _encode_ingredient_clarification(clarification_name, result.ack)
            logger.warning("clarification | LLM failed to resolve qty for '%s', retrying", clarification_name)
        else:
            logger.info("clarification | all items resolved, clearing pending_clarification")

        db.table("recipes").update({"pending_clarification": new_pending}).eq("recipe_id", session_id).execute()

    elif result.intent == Intent.question:
        db.table("recipes").update({"pending_clarification": result.answer}).eq("recipe_id", session_id).execute()
    else:
        if pending_clarification:
            db.table("recipes").update({"pending_clarification": None}).eq("recipe_id", session_id).execute()

    current_resp = db.table("ingredients").select("*").eq("recipe_id", session_id).execute()
    current_ingredients = [_db_row_to_ingredient(r) for r in (current_resp.data or [])]

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
        awaiting_clarification=new_pending is not None,
    )
