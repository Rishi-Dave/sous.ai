import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.deps import get_gemini_client
from app.main import app
from gemini_client import Intent, ParsedIngredient, UtteranceResponse

_SILENCE_WAV = Path(__file__).parent / "fixtures" / "1s-silence.wav"


def _ensure_silence_wav() -> Path:
    _SILENCE_WAV.parent.mkdir(parents=True, exist_ok=True)
    if not _SILENCE_WAV.exists():
        with wave.open(str(_SILENCE_WAV), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes(b"\x00\x00" * 16000)
    return _SILENCE_WAV


@pytest.fixture(scope="session")
def silence_wav() -> Path:
    return _ensure_silence_wav()


async def _mock_process_utterance(
    audio_bytes: bytes,
    session_ingredients: list[ParsedIngredient],
    pending_clarification: str | None,
) -> UtteranceResponse:
    return UtteranceResponse(
        intent=Intent.add_ingredient,
        ack="Got it, olive oil.",
        items=[
            ParsedIngredient(
                name="olive oil",
                qty=1,
                unit="tsp",
                raw_phrase="a splash of olive oil",
            )
        ],
    )


@pytest.fixture
def client():
    app.dependency_overrides[get_gemini_client] = lambda: _mock_process_utterance
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
