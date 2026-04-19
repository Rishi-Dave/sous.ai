import httpx
from elevenlabs.core.api_error import ApiError
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.deps import get_tts
from app.tts import ElevenLabsTTS

router = APIRouter()


@router.get("/tts/stream/{audio_id}")
def tts_stream(
    audio_id: str,
    tts: ElevenLabsTTS = Depends(get_tts),
) -> StreamingResponse:
    text = tts.pop_text(audio_id)
    if text is None:
        raise HTTPException(status_code=404, detail="audio_expired")

    stream_iter = iter(tts.synthesize_stream(text))
    # Pull the first chunk up front so connection/auth errors surface as 504
    # rather than a truncated MP3 after headers have flushed.
    first_chunk: bytes | None = None
    try:
        for chunk in stream_iter:
            if chunk:
                first_chunk = chunk
                break
    except (ApiError, httpx.HTTPError) as e:
        raise HTTPException(status_code=504, detail="tts_timeout") from e

    def gen():
        if first_chunk is not None:
            yield first_chunk
        for chunk in stream_iter:
            if chunk:
                yield chunk

    return StreamingResponse(gen(), media_type="audio/mpeg")
