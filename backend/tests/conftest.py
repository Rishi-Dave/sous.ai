import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.deps import get_gemini_client, get_tts
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


class _FakeTTS:
    """Default test double — stash_text records the spoken text; no real network."""

    def __init__(self) -> None:
        self.last_stashed: str | None = None

    def stash_text(self, text: str) -> str:
        self.last_stashed = text
        return "test-audio-id"

    def pop_text(self, audio_id: str) -> str | None:
        if audio_id != "test-audio-id":
            return None
        text = self.last_stashed
        self.last_stashed = None
        return text

    def synthesize_stream(self, text: str):
        yield b"\x00"


@pytest.fixture
def fake_tts() -> _FakeTTS:
    return _FakeTTS()


@pytest.fixture
def client(fake_tts: _FakeTTS):
    app.dependency_overrides[get_gemini_client] = lambda: _mock_process_utterance
    app.dependency_overrides[get_tts] = lambda: fake_tts
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
