from elevenlabs.core.api_error import ApiError
from fastapi.testclient import TestClient

from app.deps import get_tts
from app.main import app


class _FakeTTS:
    def __init__(self, chunks=None, raise_on_synth=None):
        self._store: dict[str, str] = {}
        self._chunks = chunks if chunks is not None else [b"ID3", b"\x00\x00ok"]
        self._raise_on_synth = raise_on_synth
        self.synth_text: str | None = None

    def stash_text(self, text: str) -> str:
        self._store["fixed-id"] = text
        return "fixed-id"

    def pop_text(self, audio_id: str) -> str | None:
        return self._store.pop(audio_id, None)

    def synthesize_stream(self, text: str):
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


def test_pop_text_is_single_use():
    fake = _FakeTTS()
    fake.stash_text("once")
    try:
        with _with_tts(fake) as c:
            r1 = c.get("/tts/stream/fixed-id")
            r2 = c.get("/tts/stream/fixed-id")
        assert r1.status_code == 200
        assert r2.status_code == 404
    finally:
        app.dependency_overrides.clear()
