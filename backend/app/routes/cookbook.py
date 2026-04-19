from fastapi import APIRouter, Depends
from supabase import Client

from app.deps import get_db
from app.schemas.cookbook import CookbookEntry, CookbookResponse

router = APIRouter()


@router.get("/users/{user_id}/recipes", response_model=CookbookResponse)
def list_user_recipes(user_id: str, db: Client = Depends(get_db)) -> CookbookResponse:
    recipes_resp = (
        db.table("recipes")
        .select("recipe_id, recipe_name, finalized_at, cook_time_seconds")
        .eq("user_id", user_id)
        .eq("status", "finalized")
        .order("finalized_at", desc=True)
        .execute()
    )
    rows = recipes_resp.data or []
    if not rows:
        return CookbookResponse(entries=[])

    recipe_ids = [r["recipe_id"] for r in rows]
    macros_resp = (
        db.table("macro_logs")
        .select("recipe_id, calories")
        .in_("recipe_id", recipe_ids)
        .execute()
    )
    calories_by_id: dict[str, float] = {
        m["recipe_id"]: float(m["calories"] or 0) for m in (macros_resp.data or [])
    }

    entries = [
        CookbookEntry(
            recipe_id=r["recipe_id"],
            recipe_name=r.get("recipe_name"),
            finalized_at=r.get("finalized_at"),
            cook_time_seconds=r.get("cook_time_seconds"),
            calories=calories_by_id.get(r["recipe_id"], 0.0),
        )
        for r in rows
    ]
    return CookbookResponse(entries=entries)
