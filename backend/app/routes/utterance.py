import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from gemini_client import Intent
from gemini_client import UtteranceResponse as GeminiUtteranceResponse

from app.deps import get_gemini_client, get_tts
from app.schemas.utterance import UtteranceResponse
from app.tts import ElevenLabsTTS

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/utterance", response_model=UtteranceResponse)
async def process_utterance_endpoint(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    gemini=Depends(get_gemini_client),
    tts: ElevenLabsTTS = Depends(get_tts),
) -> UtteranceResponse:
    audio_bytes = await audio.read()

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
        current_ingredients=result.items or [],
    )
