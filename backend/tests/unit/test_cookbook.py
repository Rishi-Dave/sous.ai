"""Tests for GET /users/{user_id}/recipes — cookbook list endpoint."""
import pytest

from app.db import make_supabase_client
from app.deps import get_settings
from tests.conftest import DEMO_USER_ID


@pytest.fixture
def db(supabase_env):
    return make_supabase_client(get_settings())


@pytest.fixture
def seeded_recipes(db):
    """Insert two finalized recipes + one in-progress, yield their IDs, clean up after."""
    rows = [
        {"user_id": DEMO_USER_ID, "status": "finalized", "recipe_name": "Pasta aglio e olio",
         "cook_time_seconds": 420},
        {"user_id": DEMO_USER_ID, "status": "finalized", "recipe_name": "Chicken curry",
         "cook_time_seconds": 1800},
        {"user_id": DEMO_USER_ID, "status": "active", "recipe_name": "Still cooking"},
    ]
    result = db.table("recipes").insert(rows).execute()
    ids = [r["recipe_id"] for r in result.data]
    db.table("macro_logs").insert([
        {"recipe_id": ids[0], "calories": 520, "protein_g": 14, "fat_g": 18, "carbs_g": 72},
        {"recipe_id": ids[1], "calories": 640, "protein_g": 32, "fat_g": 22, "carbs_g": 58},
    ]).execute()
    yield ids
    db.table("macro_logs").delete().in_("recipe_id", ids).execute()
    db.table("recipes").delete().in_("recipe_id", ids).execute()


def test_cookbook_lists_only_finalized_recipes(client, seeded_recipes):
    r = client.get(f"/users/{DEMO_USER_ID}/recipes")
    assert r.status_code == 200
    entries = r.json()["entries"]
    names = {e["recipe_name"] for e in entries}
    assert "Pasta aglio e olio" in names
    assert "Chicken curry" in names
    assert "Still cooking" not in names


def test_cookbook_entries_include_cook_time_and_calories(client, seeded_recipes):
    r = client.get(f"/users/{DEMO_USER_ID}/recipes")
    assert r.status_code == 200
    by_name = {e["recipe_name"]: e for e in r.json()["entries"]}
    assert by_name["Pasta aglio e olio"]["cook_time_seconds"] == 420
    assert by_name["Pasta aglio e olio"]["calories"] == 520
    assert by_name["Chicken curry"]["cook_time_seconds"] == 1800
    assert by_name["Chicken curry"]["calories"] == 640


def test_cookbook_empty_for_unknown_user(client):
    r = client.get("/users/00000000-0000-0000-0000-000000000099/recipes")
    assert r.status_code == 200
    assert r.json()["entries"] == []
