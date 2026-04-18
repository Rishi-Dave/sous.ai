from functools import lru_cache

from gemini_client import process_utterance

from app.config import Settings


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_gemini_client():
    return process_utterance
