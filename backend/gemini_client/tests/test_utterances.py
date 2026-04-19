"""
Utterance test harness — target ≥80% pass rate before handing off to integration.

Each test calls process_utterance() with a text-encoded audio stub and asserts
the returned UtteranceResponse matches expected intent/fields.

Run:
    uv run pytest gemini_client/tests/test_utterances.py -v
    uv run pytest gemini_client/tests/test_utterances.py -v --tb=short   # less noise

Text input convention: wrap the spoken phrase as UTF-8 bytes.
Swap for real audio bytes once recordings are available.
"""

import asyncio

import pytest
from gemini_client import Intent, ParsedIngredient, UtteranceResponse, process_utterance


@pytest.fixture(autouse=True)
async def rate_limit_buffer():
    yield
    await asyncio.sleep(1.5)


def spoken(text: str) -> bytes:
    """Encode a spoken phrase as bytes (text stub; replace with real audio later)."""
    return text.encode("utf-8")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def assert_ingredient(item: ParsedIngredient, name: str, unit: str | None = None) -> None:
    assert name.lower() in item.name.lower(), f"Expected ingredient '{name}', got '{item.name}'"
    if unit:
        assert item.unit == unit, f"Expected unit '{unit}', got '{item.unit}'"


# ---------------------------------------------------------------------------
# add_ingredient — simple quantities
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_simple_ingredient_with_qty():
    result = await process_utterance(
        audio_bytes=spoken("add two cloves of garlic"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.add_ingredient
    assert result.items and len(result.items) >= 1
    assert_ingredient(result.items[0], "garlic", "clove")
    assert result.items[0].qty == 2.0
    assert len(result.ack.split()) <= 12


@pytest.mark.asyncio
async def test_multiple_ingredients_one_utterance():
    result = await process_utterance(
        audio_bytes=spoken("add 200 grams of pasta and three cloves of garlic"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.add_ingredient
    assert result.items and len(result.items) == 2
    names = [i.name.lower() for i in result.items]
    assert any("pasta" in n for n in names)
    assert any("garlic" in n for n in names)


@pytest.mark.asyncio
async def test_ingredient_no_quantity():
    result = await process_utterance(
        audio_bytes=spoken("add some salt"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.add_ingredient
    assert result.items
    assert_ingredient(result.items[0], "salt")


# ---------------------------------------------------------------------------
# add_ingredient — vague quantity normalisation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_vague_qty_splash():
    result = await process_utterance(
        audio_bytes=spoken("add a splash of olive oil"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.add_ingredient
    assert result.items
    oil = result.items[0]
    assert_ingredient(oil, "olive oil")
    assert oil.qty == 1.0 and oil.unit == "tsp"


@pytest.mark.asyncio
async def test_vague_qty_handful():
    result = await process_utterance(
        audio_bytes=spoken("add a handful of pasta"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.add_ingredient
    assert result.items
    pasta = result.items[0]
    assert pasta.qty == 0.5 and pasta.unit == "cup"


@pytest.mark.asyncio
async def test_vague_qty_pinch():
    result = await process_utterance(
        audio_bytes=spoken("add a pinch of red pepper flakes"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.add_ingredient
    assert result.items
    assert result.items[0].qty == 0.125 and result.items[0].unit == "tsp"


@pytest.mark.asyncio
async def test_vague_qty_to_taste():
    result = await process_utterance(
        audio_bytes=spoken("add salt to taste"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.add_ingredient
    assert result.items
    assert result.items[0].qty is None


# ---------------------------------------------------------------------------
# question intent
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_question_cooking_time():
    result = await process_utterance(
        audio_bytes=spoken("how long should I boil the pasta?"),
        session_ingredients=[
            ParsedIngredient(name="pasta", qty=200, unit="g", raw_phrase="200 grams of pasta")
        ],
        pending_clarification=None,
    )
    assert result.intent == Intent.question
    assert result.answer is not None and len(result.answer) > 0
    assert len(result.ack.split()) <= 12


@pytest.mark.asyncio
async def test_question_substitution():
    result = await process_utterance(
        audio_bytes=spoken("can I use butter instead of olive oil?"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.question
    assert result.answer is not None


@pytest.mark.asyncio
async def test_question_temperature():
    result = await process_utterance(
        audio_bytes=spoken("what temperature should the pan be?"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.question
    assert result.answer is not None


# ---------------------------------------------------------------------------
# acknowledgment intent
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_acknowledgment_ok():
    result = await process_utterance(
        audio_bytes=spoken("ok"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.acknowledgment
    assert result.items is None
    assert result.answer is None


@pytest.mark.asyncio
async def test_acknowledgment_got_it():
    result = await process_utterance(
        audio_bytes=spoken("got it, thanks"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.acknowledgment


@pytest.mark.asyncio
async def test_acknowledgment_sure():
    result = await process_utterance(
        audio_bytes=spoken("sure"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.acknowledgment
    assert result.items is None
    assert result.answer is None
    assert len(result.ack.split()) <= 12


@pytest.mark.asyncio
async def test_acknowledgment_yes():
    result = await process_utterance(
        audio_bytes=spoken("yes"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.acknowledgment
    assert result.items is None
    assert result.answer is None


@pytest.mark.asyncio
async def test_acknowledgment_sounds_good():
    result = await process_utterance(
        audio_bytes=spoken("sounds good"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.acknowledgment
    assert result.items is None
    assert len(result.ack.split()) <= 12


@pytest.mark.asyncio
async def test_acknowledgment_yep():
    result = await process_utterance(
        audio_bytes=spoken("yep, that's right"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.acknowledgment
    assert result.items is None
    assert result.answer is None
    assert len(result.ack.split()) <= 12


@pytest.mark.asyncio
async def test_acknowledgment_no():
    result = await process_utterance(
        audio_bytes=spoken("no"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.acknowledgment
    assert result.items is None
    assert result.answer is None


# ---------------------------------------------------------------------------
# small_talk intent
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_small_talk_smell():
    result = await process_utterance(
        audio_bytes=spoken("this smells amazing"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.small_talk
    assert result.items is None


@pytest.mark.asyncio
async def test_small_talk_compliment():
    result = await process_utterance(
        audio_bytes=spoken("you're so helpful"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.small_talk


# ---------------------------------------------------------------------------
# clarification flow
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_clarification_answer_resolves():
    """User previously said 'add garlic' with no qty; we asked 'how much garlic?'
    This turn they answer — should resolve into an add_ingredient with qty."""
    result = await process_utterance(
        audio_bytes=spoken("about three cloves"),
        session_ingredients=[],
        pending_clarification="How much garlic would you like to add?",
    )
    assert result.intent == Intent.add_ingredient
    assert result.items
    assert_ingredient(result.items[0], "garlic")
    assert result.items[0].qty == 3.0


@pytest.mark.asyncio
async def test_clarification_vague_triggers_follow_up():
    """Vague ingredient with no qty — response may have qty=None,
    meaning Gemini should ask for clarification via ack."""
    result = await process_utterance(
        audio_bytes=spoken("add some garlic"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert result.intent == Intent.add_ingredient
    assert result.items
    garlic = result.items[0]
    assert_ingredient(garlic, "garlic")
    if garlic.qty is None:
        assert "how much" in result.ack.lower() or "?" in result.ack


# ---------------------------------------------------------------------------
# ack length constraint
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ack_always_within_12_words():
    """Ack must be ≤12 words regardless of intent — it gets spoken aloud."""
    phrases = [
        "add 300 grams of spaghetti and two cloves of garlic and a pinch of salt",
        "how do I know when the pasta is al dente?",
        "ok",
    ]
    for phrase in phrases:
        result = await process_utterance(
            audio_bytes=spoken(phrase),
            session_ingredients=[],
            pending_clarification=None,
        )
        word_count = len(result.ack.split())
        assert word_count <= 12, f"ack too long ({word_count} words): '{result.ack}'"
