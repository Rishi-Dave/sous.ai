"""Tests for POST /finalize — macro aggregation, Supabase persistence, LLM fallback."""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.db import make_supabase_client
from app.deps import get_settings
from app.main import app
from tests.conftest import DEMO_USER_ID

# ── shared mock payloads ──────────────────────────────────────────────────────

_EDAMAM_PASTA  = {"calories": 320, "protein_g": 11.2, "fat_g": 1.4,  "carbs_g": 64.0}
_EDAMAM_GARLIC = {"calories": 4,   "protein_g": 0.2,  "fat_g": 0.0,  "carbs_g": 1.0}
_LLM_SALT      = {"calories": 0,   "protein_g": 0.0,  "fat_g": 0.0,  "carbs_g": 0.0, "estimated": True}

# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def db():
    return make_supabase_client(get_settings())


@pytest.fixture
def session_id(db):
    """Create a real recipe row in local Supabase; delete it (and children) after."""
    result = db.table("recipes").insert({"user_id": DEMO_USER_ID, "status": "active"}).execute()
    rid = result.data[0]["recipe_id"]
    yield rid
    db.table("macro_logs").delete().eq("recipe_id", rid).execute()
    db.table("ingredients").delete().eq("recipe_id", rid).execute()
    db.table("recipes").delete().eq("recipe_id", rid).execute()


def _add_ingredient(db, recipe_id: str, name: str, qty: float | None = None, unit: str | None = None) -> None:
    raw = f"{qty} {unit} {name}".strip() if qty else name
    db.table("ingredients").insert({
        "recipe_id": recipe_id,
        "name": name,
        "qty": qty,
        "unit": unit,
        "raw_phrase": raw,
    }).execute()


# ── tests ─────────────────────────────────────────────────────────────────────

def test_finalize_404_for_unknown_session():
    with TestClient(app) as c:
        r = c.post("/finalize", json={
            "session_id": "00000000-0000-0000-0000-000000000000",
            "recipe_name": "Ghost",
        })
    assert r.status_code == 404


def test_finalize_returns_edamam_macros(db, session_id):
    _add_ingredient(db, session_id, "pasta", qty=200, unit="gram")

    with patch("app.nutrition._fetch_ingredient", new=AsyncMock(return_value=_EDAMAM_PASTA)):
        with TestClient(app) as c:
            r = c.post("/finalize", json={"session_id": session_id, "recipe_name": "Pasta"})

    assert r.status_code == 200
    m = r.json()["macros"]
    assert m["calories"] == 320
    assert m["protein_g"] == 11.2
    assert m["fat_g"] == 1.4
    assert m["carbs_g"] == 64.0


def test_finalize_aggregates_multiple_ingredients(db, session_id):
    _add_ingredient(db, session_id, "pasta",  qty=200, unit="gram")
    _add_ingredient(db, session_id, "garlic", qty=3,   unit="clove")

    results = iter([_EDAMAM_PASTA, _EDAMAM_GARLIC])

    async def _side_effect(*_args, **_kwargs):
        return next(results)

    with patch("app.nutrition._fetch_ingredient", new=_side_effect):
        with TestClient(app) as c:
            r = c.post("/finalize", json={"session_id": session_id, "recipe_name": "Aglio e Olio"})

    assert r.status_code == 200
    m = r.json()["macros"]
    assert m["calories"] == 324                          # 320 + 4
    assert m["protein_g"] == round(11.2 + 0.2, 1)       # 11.4
    assert set(r.json()["macros"]["per_ingredient"]) == {"pasta", "garlic"}


def test_finalize_sets_recipe_status_finalized(db, session_id):
    with patch("app.nutrition._fetch_ingredient", new=AsyncMock(return_value=None)), \
         patch("app.nutrition._estimate_ingredient", new=AsyncMock(return_value=None)):
        with TestClient(app) as c:
            r = c.post("/finalize", json={"session_id": session_id, "recipe_name": "My Dish"})

    assert r.status_code == 200
    row = db.table("recipes").select("status, recipe_name").eq("recipe_id", session_id).single().execute()
    assert row.data["status"] == "finalized"
    assert row.data["recipe_name"] == "My Dish"


def test_finalize_persists_macros_to_macro_logs(db, session_id):
    _add_ingredient(db, session_id, "pasta", qty=200, unit="gram")

    with patch("app.nutrition._fetch_ingredient", new=AsyncMock(return_value=_EDAMAM_PASTA)):
        with TestClient(app) as c:
            c.post("/finalize", json={"session_id": session_id, "recipe_name": "Pasta"})

    row = db.table("macro_logs").select("*").eq("recipe_id", session_id).single().execute()
    assert row.data["calories"] == 320
    assert row.data["per_ingredient"]["pasta"]["calories"] == 320


def test_finalize_llm_fallback_when_edamam_misses(db, session_id):
    _add_ingredient(db, session_id, "salt")

    with patch("app.nutrition._fetch_ingredient", new=AsyncMock(return_value=None)), \
         patch("app.nutrition._estimate_ingredient", new=AsyncMock(return_value=_LLM_SALT)):
        with TestClient(app) as c:
            r = c.post("/finalize", json={"session_id": session_id, "recipe_name": "Test"})

    assert r.status_code == 200
    per_ing = r.json()["macros"]["per_ingredient"]
    assert "salt" in per_ing
    assert per_ing["salt"]["estimated"] is True


def test_finalize_skips_ingredient_when_both_sources_fail(db, session_id):
    _add_ingredient(db, session_id, "mystery spice", qty=1, unit="tsp")

    with patch("app.nutrition._fetch_ingredient", new=AsyncMock(return_value=None)), \
         patch("app.nutrition._estimate_ingredient", new=AsyncMock(return_value=None)):
        with TestClient(app) as c:
            r = c.post("/finalize", json={"session_id": session_id, "recipe_name": "Test"})

    assert r.status_code == 200
    assert r.json()["macros"]["calories"] == 0
    assert "mystery spice" not in r.json()["macros"]["per_ingredient"]


def test_finalize_no_ingredients_returns_zero_macros(session_id):
    with patch("app.nutrition._fetch_ingredient", new=AsyncMock(return_value=None)):
        with TestClient(app) as c:
            r = c.post("/finalize", json={"session_id": session_id, "recipe_name": "Empty"})

    assert r.status_code == 200
    m = r.json()["macros"]
    assert m["calories"] == 0
    assert m["per_ingredient"] == {}


def test_finalize_no_edamam_creds_uses_llm(db, session_id):
    _add_ingredient(db, session_id, "pasta", qty=200, unit="gram")

    base = get_settings()

    def _no_edamam():
        from app.config import Settings
        return Settings(
            supabase_url=base.supabase_url,
            supabase_service_role_key=base.supabase_service_role_key,
            edamam_app_id=None,
            edamam_app_key=None,
            groq_api_key="fake-groq-key",
        )

    app.dependency_overrides[get_settings] = _no_edamam
    try:
        with patch("app.nutrition._estimate_ingredient", new=AsyncMock(return_value=_EDAMAM_PASTA)):
            with TestClient(app) as c:
                r = c.post("/finalize", json={"session_id": session_id, "recipe_name": "Test"})
    finally:
        app.dependency_overrides.pop(get_settings, None)

    assert r.status_code == 200
    assert r.json()["macros"]["calories"] == 320


def test_finalize_response_includes_ingredients(db, session_id):
    _add_ingredient(db, session_id, "olive oil", qty=2, unit="tbsp")

    with patch("app.nutrition._fetch_ingredient", new=AsyncMock(return_value=None)), \
         patch("app.nutrition._estimate_ingredient", new=AsyncMock(return_value=None)):
        with TestClient(app) as c:
            r = c.post("/finalize", json={"session_id": session_id, "recipe_name": "Test"})

    assert r.status_code == 200
    ings = r.json()["ingredients"]
    assert len(ings) == 1
    assert ings[0]["name"] == "olive oil"
