"""ElevenLabs Turbo v2.5 streaming TTS.

The /utterance endpoint stashes the text it wants spoken and hands mobile a short
audio id. /tts/stream/{id} synthesizes on first GET and serves from an in-memory
cache on subsequent GETs — iOS Audio.Sound fires multiple requests per playback
(probe + range), so a single-use store made the second request 404 and playback
silently failed. The cache is capped at _STORE_CAP entries and evicts FIFO.
"""

from __future__ import annotations

import threading
import uuid
from collections import OrderedDict
from typing import Iterator

from elevenlabs.client import ElevenLabs

from app.config import Settings

_STORE_CAP = 64


class ElevenLabsTTS:
    MODEL_ID = "eleven_turbo_v2_5"
    OUTPUT_FORMAT = "mp3_22050_32"

    def __init__(self, settings: Settings):
        if not settings.elevenlabs_api_key or not settings.elevenlabs_voice_id:
            raise RuntimeError("tts_not_configured")
        self._voice_id = settings.elevenlabs_voice_id
        self._client = ElevenLabs(api_key=settings.elevenlabs_api_key, timeout=30)
        self._lock = threading.Lock()
        self._text_store: OrderedDict[str, str] = OrderedDict()
        self._audio_cache: OrderedDict[str, bytes] = OrderedDict()

    def stash_text(self, text: str) -> str:
        audio_id = uuid.uuid4().hex
        with self._lock:
            self._text_store[audio_id] = text
            while len(self._text_store) > _STORE_CAP:
                evicted, _ = self._text_store.popitem(last=False)
                self._audio_cache.pop(evicted, None)
        return audio_id

    def peek_text(self, audio_id: str) -> str | None:
        with self._lock:
            return self._text_store.get(audio_id)

    def cache_audio(self, audio_id: str, data: bytes) -> None:
        with self._lock:
            self._audio_cache[audio_id] = data
            while len(self._audio_cache) > _STORE_CAP:
                self._audio_cache.popitem(last=False)

    def get_cached_audio(self, audio_id: str) -> bytes | None:
        with self._lock:
            return self._audio_cache.get(audio_id)

    # Back-compat for tests that pre-date the cache refactor.
    def pop_text(self, audio_id: str) -> str | None:
        with self._lock:
            return self._text_store.pop(audio_id, None)

    def synthesize_stream(self, text: str) -> Iterator[bytes]:
        return self._client.text_to_speech.stream(
            voice_id=self._voice_id,
            text=text,
            model_id=self.MODEL_ID,
            output_format=self.OUTPUT_FORMAT,
        )
