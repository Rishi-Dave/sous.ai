from functools import lru_cache

from gemini_client import process_utterance

from app.config import Settings
from app.tts import ElevenLabsTTS


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_gemini_client():
    return process_utterance


@lru_cache
def get_tts() -> ElevenLabsTTS:
    return ElevenLabsTTS(get_settings())
