# backend/gemini_client/ — ATHARVA OWNS THIS

This module is yours. Edit freely. Rishi's Claude Code has a deny rule that blocks him from touching it.

## Your responsibilities

- `client.py` — `process_utterance` implementation and Gemini prompt.
- `schemas.py` — Pydantic types: `Intent`, `ParsedIngredient`, `UtteranceResponse`.
- `test_utterances.py` — test harness. Must stay ≥80% accurate before Rishi integrates.

## Public contract (do not break without telling Rishi)

```python
from gemini_client import process_utterance, UtteranceResponse, ParsedIngredient, Intent

async def process_utterance(
    audio_bytes: bytes,
    session_ingredients: list[ParsedIngredient],
    pending_clarification: str | None,
) -> UtteranceResponse: ...
```

Any change to function signature or `UtteranceResponse` fields is a **breaking change** — ping Rishi before merging so he can update the mock in `backend/app/`.

## Dev loop

```bash
cd backend/gemini_client
uv run pytest test_utterances.py -v          # full harness
uv run pytest test_utterances.py -x          # fast-fail
```

Run harness after every prompt change. Target ≥80% before handing off to integration.

## Vague quantity mapping (§8)

| phrase | normalised |
|---|---|
| splash | 1 tsp |
| pinch | 0.125 tsp |
| dash | 0.5 tsp |
| drizzle | 1 tbsp |
| handful | 0.5 cup |
| to taste | null |

## If integration reveals a bug

Rishi opens an issue. He should never patch this directory himself. Coordinate via `docs/notes/<YYYY-MM-DD>-gemini-client-<slug>.md`.
