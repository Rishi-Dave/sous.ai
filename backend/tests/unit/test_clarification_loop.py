"""
Unit tests for the ingredient clarification feedback loop.

Scenario: user says "I added some garlic" without a quantity.
The backend should:
  1. Insert a qty=null garlic row and set awaiting_clarification=True.
  2. On the next utterance, resolve the qty via UPDATE (not INSERT).
  3. Clear awaiting_clarification once resolved.
  4. Never expose the INGREDIENT_CLARIFICATION: sentinel to the LLM.
"""
import io
import uuid
import wave

import pytest
from fastapi.testclient import TestClient

from app.deps import get_db, get_gemini_client, get_tts
from app.main import app
from gemini_client import Intent, ParsedIngredient, UtteranceResponse


# ---------------------------------------------------------------------------
# Fake in-memory Supabase client
# ---------------------------------------------------------------------------

class _APIResponse:
    def __init__(self, data):
        self.data = data


class _QueryBuilder:
    def __init__(self, db, table_name):
        self._db = db
        self._table = table_name
        self._filters: list[tuple] = []
        self._op: str | None = None
        self._payload: dict | None = None
        self._single = False

    def select(self, *_args):
        self._op = "select"
        return self

    def insert(self, data: dict):
        self._op = "insert"
        self._payload = data
        return self

    def update(self, data: dict):
        self._op = "update"
        self._payload = data
        return self

    def eq(self, col: str, val):
        self._filters.append(("eq", col, val))
        return self

    def ilike(self, col: str, val: str):
        self._filters.append(("ilike", col, val))
        return self

    def is_(self, col: str, val: str):
        # val is the string "null" when checking IS NULL
        self._filters.append(("is_null", col))
        return self

    def maybe_single(self):
        self._single = True
        return self

    def _match(self, row: dict) -> bool:
        for f in self._filters:
            if f[0] == "eq":
                _, col, val = f
                if row.get(col) != val:
                    return False
            elif f[0] == "ilike":
                _, col, val = f
                if (row.get(col) or "").lower() != val.lower():
                    return False
            elif f[0] == "is_null":
                _, col = f
                if row.get(col) is not None:
                    return False
        return True

    def execute(self) -> _APIResponse:
        tbl = self._db._tables.setdefault(self._table, [])

        if self._op == "insert":
            row = dict(self._payload)
            if self._table == "recipes":
                row.setdefault("recipe_id", str(uuid.uuid4()))
                row.setdefault("pending_clarification", None)
            elif self._table == "ingredients":
                row.setdefault("ingredient_id", str(uuid.uuid4()))
            tbl.append(row)
            return _APIResponse([row])

        if self._op == "select":
            rows = [r for r in tbl if self._match(r)]
            if self._single:
                return _APIResponse(rows[0] if rows else None)
            return _APIResponse(rows)

        if self._op == "update":
            updated = []
            for row in tbl:
                if self._match(row):
                    row.update(self._payload)
                    updated.append(row)
            return _APIResponse(updated)

        return _APIResponse([])


class _FakeDB:
    def __init__(self):
        self._tables: dict[str, list[dict]] = {}

    def table(self, name: str) -> _QueryBuilder:
        return _QueryBuilder(self, name)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

class _FakeTTS:
    def __init__(self) -> None:
        self.last_stashed: str | None = None

    def stash_text(self, text: str) -> str:
        self.last_stashed = text
        return "fake-id"

    def pop_text(self, audio_id: str) -> str | None:
        return None

    def synthesize_stream(self, text: str):
        yield b""


def _silence_bytes() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\x00\x00" * 1000)
    return buf.getvalue()


def _post(c: TestClient, session_id: str) -> dict:
    r = c.post(
        "/utterance",
        data={"session_id": session_id},
        files={"audio": ("a.wav", _silence_bytes(), "audio/wav")},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _make_sequential_gemini(*responses: UtteranceResponse):
    """Gemini callable that replays responses in order and records call args."""
    captured: list[dict] = []
    idx = 0

    async def _gemini(audio_bytes: bytes, session_ingredients, pending_clarification):
        nonlocal idx
        captured.append({
            "session_ingredients": session_ingredients,
            "pending_clarification": pending_clarification,
        })
        r = responses[idx]
        idx += 1
        return r

    _gemini.captured = captured  # type: ignore[attr-defined]
    return _gemini


def _new_session(c: TestClient) -> str:
    r = c.post("/sessions", json={"user_id": str(uuid.uuid4())})
    assert r.status_code == 200, r.text
    return r.json()["session_id"]


# ---------------------------------------------------------------------------
# Canned LLM responses
# ---------------------------------------------------------------------------

_GARLIC_NULL = UtteranceResponse(
    intent=Intent.add_ingredient,
    ack="How much garlic would you like to add?",
    items=[ParsedIngredient(name="garlic", qty=None, unit=None, raw_phrase="some garlic")],
)

_GARLIC_RESOLVED = UtteranceResponse(
    intent=Intent.add_ingredient,
    ack="Got it, 3 cloves of garlic.",
    items=[ParsedIngredient(name="garlic", qty=3.0, unit="clove", raw_phrase="3 cloves")],
)

_GARLIC_ESTIMATED = UtteranceResponse(
    intent=Intent.add_ingredient,
    ack="I'll use 2 cloves, a typical amount.",
    items=[ParsedIngredient(name="garlic", qty=2.0, unit="clove", raw_phrase="I don't know")],
)


# ---------------------------------------------------------------------------
# Test suite
# ---------------------------------------------------------------------------

class TestClarificationLoop:
    """Full two-turn clarification flow for an ingredient with missing qty."""

    def _overrides(self, fake_tts, mock_gemini, fake_db):
        app.dependency_overrides[get_gemini_client] = lambda: mock_gemini
        app.dependency_overrides[get_tts] = lambda: fake_tts
        app.dependency_overrides[get_db] = lambda: fake_db

    def _clear(self):
        app.dependency_overrides.clear()

    def test_incomplete_ingredient_sets_awaiting_clarification(self):
        """Turn 1: garlic with no qty → awaiting_clarification=True, question spoken aloud."""
        fake_tts = _FakeTTS()
        mock_gemini = _make_sequential_gemini(_GARLIC_NULL)
        fake_db = _FakeDB()

        self._overrides(fake_tts, mock_gemini, fake_db)
        try:
            with TestClient(app) as c:
                session_id = _new_session(c)
                body = _post(c, session_id)

            assert body["awaiting_clarification"] is True
            assert body["intent"] == "add_ingredient"
            # Question must be spoken so user knows to reply
            assert fake_tts.last_stashed == "How much garlic would you like to add?"
            # Row exists but qty is still unresolved
            garlic = next(i for i in body["current_ingredients"] if i["name"] == "garlic")
            assert garlic["qty"] is None
        finally:
            self._clear()

    def test_clarification_reply_resolves_qty(self):
        """
        Turn 1: garlic qty=null → awaiting_clarification=True.
        Turn 2: user replies "3 cloves" → single row UPDATEd, awaiting_clarification=False.
        """
        fake_tts = _FakeTTS()
        mock_gemini = _make_sequential_gemini(_GARLIC_NULL, _GARLIC_RESOLVED)
        fake_db = _FakeDB()

        self._overrides(fake_tts, mock_gemini, fake_db)
        try:
            with TestClient(app) as c:
                session_id = _new_session(c)

                body1 = _post(c, session_id)
                assert body1["awaiting_clarification"] is True

                body2 = _post(c, session_id)
                assert body2["awaiting_clarification"] is False
                assert body2["intent"] == "add_ingredient"

                # Exactly one garlic row, now resolved — no duplicate insert
                garlic_rows = [i for i in body2["current_ingredients"] if i["name"] == "garlic"]
                assert len(garlic_rows) == 1
                assert garlic_rows[0]["qty"] == 3.0
                assert garlic_rows[0]["unit"] == "clove"
        finally:
            self._clear()

    def test_sentinel_prefix_never_reaches_llm(self):
        """The INGREDIENT_CLARIFICATION: prefix is an app-layer concern — LLM must never see it."""
        fake_tts = _FakeTTS()
        mock_gemini = _make_sequential_gemini(_GARLIC_NULL, _GARLIC_RESOLVED)
        fake_db = _FakeDB()

        self._overrides(fake_tts, mock_gemini, fake_db)
        try:
            with TestClient(app) as c:
                session_id = _new_session(c)
                _post(c, session_id)   # turn 1 — stores sentinel in DB
                _post(c, session_id)   # turn 2 — LLM receives decoded text

            turn2_pending = mock_gemini.captured[1]["pending_clarification"]
            assert turn2_pending is not None
            assert "INGREDIENT_CLARIFICATION:" not in turn2_pending
            assert "garlic" in turn2_pending.lower()
        finally:
            self._clear()

    def test_unsure_user_gets_llm_estimate(self):
        """
        When user says "I don't know", the LLM supplies a culinary estimate.
        Estimated qty must be persisted and clarification must clear.
        """
        fake_tts = _FakeTTS()
        mock_gemini = _make_sequential_gemini(_GARLIC_NULL, _GARLIC_ESTIMATED)
        fake_db = _FakeDB()

        self._overrides(fake_tts, mock_gemini, fake_db)
        try:
            with TestClient(app) as c:
                session_id = _new_session(c)

                body1 = _post(c, session_id)
                assert body1["awaiting_clarification"] is True

                body2 = _post(c, session_id)
                assert body2["awaiting_clarification"] is False

                garlic_rows = [i for i in body2["current_ingredients"] if i["name"] == "garlic"]
                assert len(garlic_rows) == 1
                assert garlic_rows[0]["qty"] == 2.0   # LLM-supplied default
                assert garlic_rows[0]["unit"] == "clove"

            # Estimate ack must be spoken so user hears what was assumed
            assert fake_tts.last_stashed == "I'll use 2 cloves, a typical amount."
        finally:
            self._clear()


# ---------------------------------------------------------------------------
# Ingredient accumulation / replacement
# ---------------------------------------------------------------------------

_OLIVE_OIL_INITIAL = UtteranceResponse(
    intent=Intent.add_ingredient,
    ack="Got it, 2 tablespoons of olive oil.",
    items=[ParsedIngredient(name="olive oil", qty=2.0, unit="tbsp", raw_phrase="2 tablespoons olive oil")],
)

_OLIVE_OIL_ADD_MORE = UtteranceResponse(
    intent=Intent.add_ingredient,
    ack="Got it, 1 more tablespoon.",
    items=[ParsedIngredient(name="olive oil", qty=1.0, unit="tbsp", raw_phrase="another tablespoon", action="add")],
)

_OLIVE_OIL_REPLACE = UtteranceResponse(
    intent=Intent.add_ingredient,
    ack="Changed olive oil to 4 tablespoons.",
    items=[ParsedIngredient(name="olive oil", qty=4.0, unit="tbsp", raw_phrase="change to 4 tablespoons", action="replace")],
)

_OLIVE_OIL_REPLACE_NEW = UtteranceResponse(
    intent=Intent.add_ingredient,
    ack="Got it, olive oil.",
    items=[ParsedIngredient(name="olive oil", qty=2.0, unit="tbsp", raw_phrase="olive oil", action="replace")],
)


class TestIngredientUpdate:
    """Existing ingredient mentioned again — accumulate or replace based on action field."""

    def _overrides(self, fake_tts, mock_gemini, fake_db):
        app.dependency_overrides[get_gemini_client] = lambda: mock_gemini
        app.dependency_overrides[get_tts] = lambda: fake_tts
        app.dependency_overrides[get_db] = lambda: fake_db

    def _clear(self):
        app.dependency_overrides.clear()

    def test_action_add_accumulates_qty(self):
        """Turn 1: 2 tbsp olive oil. Turn 2: add 1 more tbsp. Expect 3 tbsp total, one row."""
        fake_tts = _FakeTTS()
        mock_gemini = _make_sequential_gemini(_OLIVE_OIL_INITIAL, _OLIVE_OIL_ADD_MORE)
        fake_db = _FakeDB()

        self._overrides(fake_tts, mock_gemini, fake_db)
        try:
            with TestClient(app) as c:
                session_id = _new_session(c)
                _post(c, session_id)
                body2 = _post(c, session_id)

            oil_rows = [i for i in body2["current_ingredients"] if i["name"] == "olive oil"]
            assert len(oil_rows) == 1, "must not duplicate the row"
            assert oil_rows[0]["qty"] == pytest.approx(3.0)
            assert oil_rows[0]["unit"] == "tbsp"
        finally:
            self._clear()

    def test_action_replace_overwrites_qty(self):
        """Turn 1: 2 tbsp olive oil. Turn 2: change to 4 tbsp. Expect 4 tbsp total, one row."""
        fake_tts = _FakeTTS()
        mock_gemini = _make_sequential_gemini(_OLIVE_OIL_INITIAL, _OLIVE_OIL_REPLACE)
        fake_db = _FakeDB()

        self._overrides(fake_tts, mock_gemini, fake_db)
        try:
            with TestClient(app) as c:
                session_id = _new_session(c)
                _post(c, session_id)
                body2 = _post(c, session_id)

            oil_rows = [i for i in body2["current_ingredients"] if i["name"] == "olive oil"]
            assert len(oil_rows) == 1
            assert oil_rows[0]["qty"] == pytest.approx(4.0)
        finally:
            self._clear()

    def test_action_replace_on_new_ingredient_inserts(self):
        """action='replace' on an ingredient not yet in the session still inserts it (no existing row to overwrite)."""
        fake_tts = _FakeTTS()
        mock_gemini = _make_sequential_gemini(_OLIVE_OIL_REPLACE_NEW)
        fake_db = _FakeDB()

        self._overrides(fake_tts, mock_gemini, fake_db)
        try:
            with TestClient(app) as c:
                session_id = _new_session(c)
                body = _post(c, session_id)

            oil_rows = [i for i in body["current_ingredients"] if i["name"] == "olive oil"]
            assert len(oil_rows) == 1
            assert oil_rows[0]["qty"] == pytest.approx(2.0)
        finally:
            self._clear()

    def test_action_add_with_null_existing_qty_uses_new_qty(self):
        """
        Garlic row exists with qty=None (clarification pending).
        A second add with action='add' and a real qty should set qty to the new value,
        not attempt null arithmetic.
        """
        fake_tts = _FakeTTS()
        garlic_add = UtteranceResponse(
            intent=Intent.add_ingredient,
            ack="How much garlic would you like to add?",
            items=[ParsedIngredient(name="garlic", qty=None, unit=None, raw_phrase="garlic", action="add")],
        )
        garlic_more = UtteranceResponse(
            intent=Intent.add_ingredient,
            ack="Got it, 2 cloves of garlic.",
            items=[ParsedIngredient(name="garlic", qty=2.0, unit="clove", raw_phrase="2 cloves", action="add")],
        )
        mock_gemini = _make_sequential_gemini(garlic_add, garlic_more)
        fake_db = _FakeDB()

        self._overrides(fake_tts, mock_gemini, fake_db)
        try:
            with TestClient(app) as c:
                session_id = _new_session(c)
                _post(c, session_id)   # inserts garlic qty=None, sets pending
                body2 = _post(c, session_id)

            garlic_rows = [i for i in body2["current_ingredients"] if i["name"] == "garlic"]
            assert len(garlic_rows) == 1
            assert garlic_rows[0]["qty"] == pytest.approx(2.0)
        finally:
            self._clear()

    def test_multiple_ingredients_one_existing_one_new(self):
        """
        User says "add more olive oil and also pasta".
        olive oil is already in session → accumulate; pasta is new → insert.
        """
        fake_tts = _FakeTTS()
        combined = UtteranceResponse(
            intent=Intent.add_ingredient,
            ack="Got it.",
            items=[
                ParsedIngredient(name="olive oil", qty=1.0, unit="tbsp", raw_phrase="more olive oil", action="add"),
                ParsedIngredient(name="pasta", qty=100.0, unit="gram", raw_phrase="pasta"),
            ],
        )
        mock_gemini = _make_sequential_gemini(_OLIVE_OIL_INITIAL, combined)
        fake_db = _FakeDB()

        self._overrides(fake_tts, mock_gemini, fake_db)
        try:
            with TestClient(app) as c:
                session_id = _new_session(c)
                _post(c, session_id)
                body2 = _post(c, session_id)

            by_name = {i["name"]: i for i in body2["current_ingredients"]}
            assert by_name["olive oil"]["qty"] == pytest.approx(3.0)
            assert by_name["pasta"]["qty"] == pytest.approx(100.0)
        finally:
            self._clear()


# ---------------------------------------------------------------------------
# Session lifecycle — clean start, no bleed between sessions
# ---------------------------------------------------------------------------

class TestSessionLifecycle:
    """New sessions start clean; finalized sessions do not bleed state into new ones."""

    def _overrides(self, fake_tts, mock_gemini, fake_db):
        app.dependency_overrides[get_gemini_client] = lambda: mock_gemini
        app.dependency_overrides[get_tts] = lambda: fake_tts
        app.dependency_overrides[get_db] = lambda: fake_db

    def _clear(self):
        app.dependency_overrides.clear()

    def test_first_utterance_of_new_session_has_no_pending_clarification(self):
        """The LLM must receive pending_clarification=None on the very first utterance of a session."""
        fake_tts = _FakeTTS()
        mock_gemini = _make_sequential_gemini(
            UtteranceResponse(intent=Intent.small_talk, ack="Hello!", items=None, answer=None)
        )
        fake_db = _FakeDB()

        self._overrides(fake_tts, mock_gemini, fake_db)
        try:
            with TestClient(app) as c:
                session_id = _new_session(c)
                _post(c, session_id)

            assert mock_gemini.captured[0]["pending_clarification"] is None
        finally:
            self._clear()

    def test_sessions_are_isolated_no_ingredient_bleed(self):
        """Ingredients from session A must not appear in session B."""
        fake_tts = _FakeTTS()
        mock_gemini = _make_sequential_gemini(
            _OLIVE_OIL_INITIAL,
            UtteranceResponse(intent=Intent.small_talk, ack="Sure!", items=None, answer=None),
        )
        fake_db = _FakeDB()

        self._overrides(fake_tts, mock_gemini, fake_db)
        try:
            with TestClient(app) as c:
                session_a = _new_session(c)
                _post(c, session_a)   # session A now has olive oil

                session_b = _new_session(c)
                body_b = _post(c, session_b)  # session B — no ingredient

            assert body_b["current_ingredients"] == []
        finally:
            self._clear()

    def test_pending_clarification_does_not_bleed_across_sessions(self):
        """
        Session A ends mid-clarification (pending_clarification set).
        Session B starts fresh — LLM must receive pending_clarification=None.
        """
        fake_tts = _FakeTTS()
        mock_gemini = _make_sequential_gemini(
            _GARLIC_NULL,   # session A turn 1 → sets pending
            UtteranceResponse(intent=Intent.small_talk, ack="Hi!", items=None, answer=None),  # session B turn 1
        )
        fake_db = _FakeDB()

        self._overrides(fake_tts, mock_gemini, fake_db)
        try:
            with TestClient(app) as c:
                session_a = _new_session(c)
                body_a = _post(c, session_a)
                assert body_a["awaiting_clarification"] is True

                session_b = _new_session(c)
                _post(c, session_b)

            # Turn 2 belongs to session B; pending_clarification must be None
            assert mock_gemini.captured[1]["pending_clarification"] is None
        finally:
            self._clear()
