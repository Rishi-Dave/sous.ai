from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str | None = None
    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str | None = None
    groq_api_key: str | None = None
    edamam_app_id: str | None = None
    edamam_app_key: str | None = None
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
