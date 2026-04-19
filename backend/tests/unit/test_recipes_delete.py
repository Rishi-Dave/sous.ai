"""Tests for DELETE /recipes/{recipe_id} — removes recipe and its children."""
import pytest

from app.db import make_supabase_client
from app.deps import get_settings
from tests.conftest import DEMO_USER_ID


@pytest.fixture
def db(supabase_env):
    return make_supabase_client(get_settings())


@pytest.fixture
def seeded_recipe(db):
    """Insert one finalized recipe with macros + ingredients; yield its id, clean up stragglers."""
    result = db.table("recipes").insert({
        "user_id": DEMO_USER_ID,
        "status": "finalized",
        "recipe_name": "Doomed recipe",
    }).execute()
    rid = result.data[0]["recipe_id"]
    db.table("ingredients").insert({
        "recipe_id": rid,
        "name": "ghost pepper",
        "qty": 1,
        "unit": None,
        "raw_phrase": "one ghost pepper",
    }).execute()
    db.table("macro_logs").insert({
        "recipe_id": rid,
        "calories": 42,
        "protein_g": 1,
        "fat_g": 0,
        "carbs_g": 10,
    }).execute()
    yield rid
    # Best-effort cleanup in case a test bails out before deleting.
    db.table("macro_logs").delete().eq("recipe_id", rid).execute()
    db.table("ingredients").delete().eq("recipe_id", rid).execute()
    db.table("recipes").delete().eq("recipe_id", rid).execute()


def test_delete_recipe_returns_204_and_cascades(client, db, seeded_recipe):
    r = client.delete(f"/recipes/{seeded_recipe}")
    assert r.status_code == 204

    recipe_rows = db.table("recipes").select("recipe_id").eq("recipe_id", seeded_recipe).execute().data
    ingredient_rows = db.table("ingredients").select("ingredient_id").eq("recipe_id", seeded_recipe).execute().data
    macro_rows = db.table("macro_logs").select("recipe_id").eq("recipe_id", seeded_recipe).execute().data
    assert recipe_rows == []
    assert ingredient_rows == []
    assert macro_rows == []


def test_delete_recipe_404_for_unknown_id(client):
    r = client.delete("/recipes/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404
