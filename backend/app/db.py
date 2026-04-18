from supabase import Client, create_client

from app.config import Settings


def make_supabase_client(settings: Settings) -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
