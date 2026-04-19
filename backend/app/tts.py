"""ElevenLabs Turbo v2.5 streaming TTS.

The /utterance endpoint stashes the text it wants spoken and hands mobile a short
audio id. /tts/stream/{id} pops the text and streams MP3 bytes back. Keeps the
text off the URL (privacy) and avoids a round trip through the DB for a payload
that is only relevant for ~2s.
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
        self._store: OrderedDict[str, str] = OrderedDict()

    def stash_text(self, text: str) -> str:
        audio_id = uuid.uuid4().hex
        with self._lock:
            self._store[audio_id] = text
            while len(self._store) > _STORE_CAP:
                self._store.popitem(last=False)
        return audio_id

    def pop_text(self, audio_id: str) -> str | None:
        with self._lock:
            return self._store.pop(audio_id, None)

    def synthesize_stream(self, text: str) -> Iterator[bytes]:
        return self._client.text_to_speech.stream(
            voice_id=self._voice_id,
            text=text,
            model_id=self.MODEL_ID,
            output_format=self.OUTPUT_FORMAT,
        )
