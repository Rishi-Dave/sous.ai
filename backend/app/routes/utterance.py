from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.deps import get_gemini_client
from app.schemas.utterance import UtteranceResponse

router = APIRouter()


@router.post("/utterance", response_model=UtteranceResponse)
async def process_utterance_endpoint(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    gemini=Depends(get_gemini_client),
) -> UtteranceResponse:
    audio_bytes = await audio.read()
    result = await gemini(audio_bytes, [], None)
    return UtteranceResponse(
        intent=result.intent,
        ack_audio_url="/static/ack-stub.mp3",
        items=result.items,
        answer=result.answer,
        current_ingredients=result.items or [],
    )
