import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from groq import AsyncGroq

from app.config import Settings
from app.deps import get_settings
from app.schemas.wake_probe import WakeProbeResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# Case-insensitive substring match after lowercasing transcript.
_WAKE_MARKERS = ("hey sous", "hey chef", "hey sou")


def _is_wake_transcript(text: str) -> bool:
    t = (text or "").lower().strip()
    return any(m in t for m in _WAKE_MARKERS)


async def _transcribe_short_clip(client: AsyncGroq, audio_bytes: bytes, filename: str, content_type: str) -> str:
    transcription = await client.audio.transcriptions.create(
        file=(filename, audio_bytes, content_type),
        model="whisper-large-v3-turbo",
    )
    return (transcription.text or "").strip()


@router.post("/wake_probe", response_model=WakeProbeResponse)
async def wake_probe(
    audio: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
) -> WakeProbeResponse:
    if not settings.groq_api_key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not configured")

    audio_bytes = await audio.read()
    if not audio_bytes:
        return WakeProbeResponse(wake=False)

    filename = audio.filename or "clip.m4a"
    lower = filename.lower()
    if lower.endswith(".webm"):
        content_type = audio.content_type or "audio/webm"
    elif lower.endswith(".wav"):
        content_type = audio.content_type or "audio/wav"
    else:
        content_type = audio.content_type or "audio/mp4"

    client = AsyncGroq(api_key=settings.groq_api_key)
    try:
        text = await _transcribe_short_clip(client, audio_bytes, filename, content_type)
    except Exception as e:
        logger.warning("wake_probe_transcribe_failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=502, detail="transcription failed") from e

    wake = _is_wake_transcript(text)
    logger.info("wake_probe | wake=%s | text=%r", wake, text[:120])
    return WakeProbeResponse(wake=wake)
