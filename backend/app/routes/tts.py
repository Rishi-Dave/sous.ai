import httpx
from elevenlabs.core.api_error import ApiError
from fastapi import APIRouter, Depends, HTTPException, Response

from app.deps import get_tts
from app.tts import ElevenLabsTTS

router = APIRouter()


@router.get("/tts/stream/{audio_id}")
def tts_stream(
    audio_id: str,
    tts: ElevenLabsTTS = Depends(get_tts),
) -> Response:
    # iOS Audio.Sound fires multiple requests (probe + range) before it commits
    # to playback. Serve from the bytes cache if we've already synthesized.
    cached = tts.get_cached_audio(audio_id)
    if cached is not None:
        return Response(content=cached, media_type="audio/mpeg")

    text = tts.peek_text(audio_id)
    if text is None:
        raise HTTPException(status_code=404, detail="audio_expired")

    try:
        chunks = list(tts.synthesize_stream(text))
    except (ApiError, httpx.HTTPError) as e:
        raise HTTPException(status_code=504, detail="tts_timeout") from e

    data = b"".join(c for c in chunks if c)
    tts.cache_audio(audio_id, data)
    return Response(content=data, media_type="audio/mpeg")
