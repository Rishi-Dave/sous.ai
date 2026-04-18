# backend/gemini_client/ — ATHARVA-OWNED

## STOP

**Do not edit any file in this tree.** This module is owned by Atharva and shipped as a pure Python interface the backend imports. Patching it locally breaks the integration contract and guarantees a merge mess at hour 16.

## What you may do here

- Run tests to verify integration: `cd backend/gemini_client && pytest test_utterances.py -v`.
- Read source to understand the public interface (`process_utterance`, `UtteranceResponse`, `ParsedIngredient`, `Intent`).
- Import from this module inside `backend/app/`.

## What to do if a change is needed here

1. Write a note describing the issue: `docs/notes/<YYYY-MM-DD>-gemini-client-<slug>.md`. Include: symptom, reproduction command, affected inputs, suggested fix direction (not a patch).
2. Open a GitHub issue tagged for Atharva, linking the note.
3. If it's blocking, ping Atharva directly — do not work around it by editing here.

## Public interface (read-only reference)

```python
from gemini_client import process_utterance, UtteranceResponse, ParsedIngredient, Intent

async def process_utterance(
    audio_bytes: bytes,
    session_ingredients: list[ParsedIngredient],
    pending_clarification: str | None,
) -> UtteranceResponse: ...
```

See `docs/design.md` §8 for the schema. If this drifts, it's a breaking change — flag it immediately.
