from elevenlabs.core.api_error import ApiError
from fastapi.testclient import TestClient

from app.deps import get_tts
from app.main import app


class _FakeTTS:
    def __init__(self, chunks=None, raise_on_synth=None):
        self._text_store: dict[str, str] = {}
        self._audio_cache: dict[str, bytes] = {}
        self._chunks = chunks if chunks is not None else [b"ID3", b"\x00\x00ok"]
        self._raise_on_synth = raise_on_synth
        self.synth_calls = 0
        self.synth_text: str | None = None

    def stash_text(self, text: str) -> str:
        self._text_store["fixed-id"] = text
        return "fixed-id"

    def peek_text(self, audio_id: str) -> str | None:
        return self._text_store.get(audio_id)

    def pop_text(self, audio_id: str) -> str | None:
        return self._text_store.pop(audio_id, None)

    def get_cached_audio(self, audio_id: str) -> bytes | None:
        return self._audio_cache.get(audio_id)

    def cache_audio(self, audio_id: str, data: bytes) -> None:
        self._audio_cache[audio_id] = data

    def synthesize_stream(self, text: str):
        self.synth_calls += 1
        self.synth_text = text
        if self._raise_on_synth is not None:
            raise self._raise_on_synth
        yield from self._chunks


def _with_tts(fake: _FakeTTS):
    app.dependency_overrides[get_tts] = lambda: fake
    return TestClient(app)


def test_stream_happy_path_returns_audio_mpeg():
    fake = _FakeTTS(chunks=[b"first-chunk", b"second-chunk"])
    fake.stash_text("hello there")
    try:
        with _with_tts(fake) as c:
            r = c.get("/tts/stream/fixed-id")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("audio/mpeg")
        assert r.content == b"first-chunksecond-chunk"
        assert fake.synth_text == "hello there"
    finally:
        app.dependency_overrides.clear()


def test_stream_404_on_missing_id():
    fake = _FakeTTS()
    try:
        with _with_tts(fake) as c:
            r = c.get("/tts/stream/nonexistent")
        assert r.status_code == 404
        assert r.json() == {"detail": "audio_expired"}
    finally:
        app.dependency_overrides.clear()


def test_stream_504_on_elevenlabs_api_error():
    fake = _FakeTTS(raise_on_synth=ApiError(status_code=502, body={"error": "upstream"}))
    fake.stash_text("hi")
    try:
        with _with_tts(fake) as c:
            r = c.get("/tts/stream/fixed-id")
        assert r.status_code == 504
        assert r.json() == {"detail": "tts_timeout"}
    finally:
        app.dependency_overrides.clear()


def test_stream_serves_cached_bytes_on_repeat_gets():
    """iOS Audio.Sound fires multiple GETs per playback (probe + range). Each must
    return the same 200/bytes without re-synthesizing; the pre-cache single-use
    design silently broke native TTS."""
    fake = _FakeTTS(chunks=[b"mp3-bytes"])
    fake.stash_text("once")
    try:
        with _with_tts(fake) as c:
            r1 = c.get("/tts/stream/fixed-id")
            r2 = c.get("/tts/stream/fixed-id")
            r3 = c.get("/tts/stream/fixed-id")
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r3.status_code == 200
        assert r1.content == r2.content == r3.content == b"mp3-bytes"
        assert fake.synth_calls == 1, "should only synthesize on first call"
    finally:
        app.dependency_overrides.clear()
