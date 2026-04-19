# gemini_client clarification flow returns wrong ack for qty=null case

**Date:** 2026-04-18
**Reporter:** Rishi (manual mobile test against current `main`, post #14 merge)
**Affected commit range:** Likely 93b1ddd (`feat: add finish_recipe intent`) onward — clarification ack worked before this rollout.

## Symptom

User says: **"I want milk"**

Expected ack (per system prompt): **"How much milk would you like to add?"** — a question that prompts the user for quantity.

Actual ack: **"Sounds good, adding milk."** — a generic acknowledgement; no quantity question asked.

The app then re-arms normally (Speaking → PLAYBACK_ENDED → Armed), so the user hears the wrong reply but the state machine continues. They don't know they're supposed to volunteer the quantity — and even if they do, `pending_clarification` was likely not set, so the next utterance won't be interpreted as a clarification reply.

## What the system prompt says

From the `process_utterance` system prompt (line that should govern this case):

> add_ingredient with qty=null: add the item to items AND ask qty in ack. Phrase it as: "How much [ingredient] would you like to add?" e.g. "How much garlic would you like to add?" (8 words ✓)

Model is returning intent=add_ingredient, items=[milk with qty=null], but ack is a confirmation rather than the prescribed question.

## Hypothesis

The `finish_recipe` intent was added in 93b1ddd. The system prompt was likely retuned in that rollout. The new few-shot examples or the new intent's instructions may have:
- Diluted the "ask for qty" rule
- Implicitly shifted the model toward "always confirm" framing
- Removed or weakened the negative example showing what NOT to say when qty is null

## How to repro

```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
# In another terminal, with a wav saying "I want milk":
curl -X POST http://localhost:8000/utterance \
  -F "session_id=<sid>" \
  -F "audio=@/tmp/i_want_milk.m4a;type=audio/m4a" | jq '.ack, .items, .ack_audio_url'
```

Check the `ack` text. Should be a question; will likely be a confirmation.

Even simpler — add a failing test to `backend/gemini_client/test_utterances.py`:

```python
def test_qty_null_triggers_clarification_question():
    resp = process_utterance(
        load_audio("i_want_milk.m4a"),
        session_ingredients=[],
        pending_clarification=None,
    )
    assert resp.intent == Intent.add_ingredient
    assert resp.items and resp.items[0].name.lower() == "milk" and resp.items[0].qty is None
    # The ack must be a question that names the ingredient.
    assert "milk" in resp.ack.lower()
    assert "?" in resp.ack or any(k in resp.ack.lower() for k in ["how much", "how many"])
```

This should fail today; running `pytest tests/test_utterances.py::test_qty_null_triggers_clarification_question -v` will print the actual ack so you can see what the model is returning.

## Ownership

Atharva — `backend/gemini_client/` is yours per root CLAUDE.md. Rishi will not patch.

## Demo impact

Medium. The pasta aglio e olio golden path uses ingredients with explicit quantities ("a splash of olive oil", "two cloves of garlic") — those should NOT trigger this branch. So the canned demo still works. But any ad-libbed "I want X" without a quantity will fail noticeably. Worth fixing before demo.

## Workaround if not fixed before demo

Demo script: never say a bare ingredient — always include a quantity vague-or-otherwise ("a splash of milk", "some milk"). The "some X" → qty=null path may also trigger the bug, so prefer "a splash of" / "a cup of" / explicit numbers.
