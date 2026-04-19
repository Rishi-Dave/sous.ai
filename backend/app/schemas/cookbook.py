from pydantic import BaseModel


class CookbookEntry(BaseModel):
    recipe_id: str
    recipe_name: str | None = None
    finalized_at: str | None = None
    cook_time_seconds: int | None = None
    calories: float = 0


class CookbookResponse(BaseModel):
    entries: list[CookbookEntry]
