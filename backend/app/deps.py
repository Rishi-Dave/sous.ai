from functools import lru_cache

from fastapi import Depends
from gemini_client import process_utterance
from supabase import Client

from app.config import Settings
from app.db import make_supabase_client


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_gemini_client():
    return process_utterance


def get_db(settings: Settings = Depends(get_settings)) -> Client:
    return make_supabase_client(settings)
