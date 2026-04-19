import io
import wave

from fastapi.testclient import TestClient

from app.deps import get_gemini_client, get_tts
from app.main import app
from gemini_client import Intent, ParsedIngredient, UtteranceResponse


def _silence_bytes() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\x00\x00" * 1000)
    return buf.getvalue()


class _FakeTTS:
    def __init__(self) -> None:
        self.last_stashed: str | None = None

    def stash_text(self, text: str) -> str:
        self.last_stashed = text
        return "fake-id-xyz"

    def pop_text(self, audio_id: str) -> str | None:
        return None

    def synthesize_stream(self, text: str):
        yield b""


def _post_utterance(c: TestClient) -> dict:
    r = c.post(
        "/utterance",
        data={"session_id": "test-session"},
        files={"audio": ("a.wav", _silence_bytes(), "audio/wav")},
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_utterance_add_ingredient_stashes_ack():
    fake_tts = _FakeTTS()

    async def mock_gemini(*_args, **_kwargs):
        return UtteranceResponse(
            intent=Intent.add_ingredient,
            ack="Got it, olive oil.",
            items=[ParsedIngredient(name="olive oil", qty=1, unit="tsp", raw_phrase="olive oil")],
        )

    app.dependency_overrides[get_gemini_client] = lambda: mock_gemini
    app.dependency_overrides[get_tts] = lambda: fake_tts
    try:
        with TestClient(app) as c:
            body = _post_utterance(c)
        assert body["intent"] == "add_ingredient"
        assert body["ack_audio_url"] == "/tts/stream/fake-id-xyz"
        assert fake_tts.last_stashed == "Got it, olive oil."
    finally:
        app.dependency_overrides.clear()


def test_utterance_question_intent_stashes_answer_not_ack():
    fake_tts = _FakeTTS()

    async def mock_gemini(*_args, **_kwargs):
        return UtteranceResponse(
            intent=Intent.question,
            ack="Sure.",
            items=None,
            answer="About 12 minutes at medium heat.",
        )

    app.dependency_overrides[get_gemini_client] = lambda: mock_gemini
    app.dependency_overrides[get_tts] = lambda: fake_tts
    try:
        with TestClient(app) as c:
            body = _post_utterance(c)
        assert body["intent"] == "question"
        assert body["answer"] == "About 12 minutes at medium heat."
        assert fake_tts.last_stashed == "About 12 minutes at medium heat."
    finally:
        app.dependency_overrides.clear()


def test_utterance_question_intent_with_null_answer_falls_back_to_ack():
    fake_tts = _FakeTTS()

    async def mock_gemini(*_args, **_kwargs):
        return UtteranceResponse(
            intent=Intent.question,
            ack="I didn't catch that.",
            items=None,
            answer=None,
        )

    app.dependency_overrides[get_gemini_client] = lambda: mock_gemini
    app.dependency_overrides[get_tts] = lambda: fake_tts
    try:
        with TestClient(app) as c:
            body = _post_utterance(c)
        assert body["ack_audio_url"].startswith("/tts/stream/")
        assert fake_tts.last_stashed == "I didn't catch that."
    finally:
        app.dependency_overrides.clear()


def test_utterance_gemini_raises_soft_falls_to_okay():
    """Until Atharva's gemini_client JSON-parse bug is fixed, /utterance must keep
    the demo loop alive rather than leaking a 500."""
    fake_tts = _FakeTTS()

    async def broken_gemini(*_args, **_kwargs):
        raise ValueError("Extra data: line 1 column 112 (char 111)")

    app.dependency_overrides[get_gemini_client] = lambda: broken_gemini
    app.dependency_overrides[get_tts] = lambda: fake_tts
    try:
        with TestClient(app) as c:
            body = _post_utterance(c)
        assert body["intent"] == "small_talk"
        assert body["ack_audio_url"].startswith("/tts/stream/")
        assert fake_tts.last_stashed == "Okay."
    finally:
        app.dependency_overrides.clear()


def test_utterance_empty_ack_and_null_answer_falls_back_to_filler():
    """Until gemini_client reliably populates ack, empty text should not 400 ElevenLabs."""
    fake_tts = _FakeTTS()

    async def mock_gemini(*_args, **_kwargs):
        return UtteranceResponse(
            intent=Intent.add_ingredient,
            ack="   ",
            items=None,
            answer=None,
        )

    app.dependency_overrides[get_gemini_client] = lambda: mock_gemini
    app.dependency_overrides[get_tts] = lambda: fake_tts
    try:
        with TestClient(app) as c:
            body = _post_utterance(c)
        assert body["ack_audio_url"].startswith("/tts/stream/")
        assert fake_tts.last_stashed == "Okay."
    finally:
        app.dependency_overrides.clear()
