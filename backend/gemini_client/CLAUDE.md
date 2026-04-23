# backend/gemini_client/ — Gemini client

Classification, ingredient extraction, clarification, and Q&A for `/utterance`. Either dev may edit this module per the partner-workflow feedback memory — branch prefix identifies the driver, not ownership. Breaking contract changes still require coordination.

## Public contract

```python
from gemini_client import process_utterance, UtteranceResponse, ParsedIngredient, Intent

async def process_utterance(
    audio_bytes: bytes,
    session_ingredients: list[ParsedIngredient],
    pending_clarification: str | None,
) -> UtteranceResponse: ...
```

Changes to the function signature or to `UtteranceResponse` / `ParsedIngredient` / `Intent` are **breaking**. Flag explicitly in the PR description and re-run the mock in `backend/app/` so the integration stays in sync.

## What lives here

- `client.py` — `process_utterance` + the Groq call + the system prompt.
- `schemas.py` — Pydantic types (`Intent`, `ParsedIngredient`, `UtteranceResponse`).
- `tests/test_utterances.py` — semantic assertion tests (e.g. "ack contains a question when qty=null"). Rich, low-volume. Targets ≥80% pre-integration.
- `evals/` — YAML-driven classification eval, 160 cases across 14 categories. Baseline-gated; see [evals/README.md](evals/README.md). Run before merging any prompt change.

## Dev loop

```bash
cd backend
uv run pytest gemini_client/tests/test_utterances.py -v   # semantic harness
uv run pytest gemini_client/evals/ -q                     # classification eval (~40 min live)
uv run python -m gemini_client.evals._lint                # offline schema check
```

Run the eval harness after every prompt change. A regression below the committed baseline fails the session and blocks the PR.

## Vague quantity mapping (§8)

| phrase | normalised |
|---|---|
| splash | 1 tsp |
| pinch | 0.125 tsp |
| dash | 0.5 tsp |
| drizzle | 1 tbsp |
| handful | 0.5 cup |
| to taste | null |

## Regression targets on file

When you iterate on the prompt, these are the known failure modes to beat (per `docs/notes/2026-04-18-*`):

- Past-tense narration (_"added oil"_, _"throwing in some garlic"_) misclassifies as `acknowledgment` / `small_talk` instead of `add_ingredient`. Eval category: `add_ingredient_past_tense`, currently baselined at 0.75.
- `add_ingredient` with `qty=null` (_"I want milk"_) returns a generic confirmation instead of the prescribed _"How much milk would you like to add?"_ question. Eval category: `add_ingredient_no_qty`, baselined at 0.80.
- `q_sub_heavy_cream` triggers a JSON-extra-data Pydantic validation error — the route has a soft-fall workaround; the root cause is in the Groq output format.

## Cross-cutting PR discipline

When a diff crosses module boundaries (touching both `backend/app/` and `gemini_client/`), capture the context in `docs/notes/<YYYY-MM-DD>-gemini-client-<slug>.md` and link it from the PR description so whoever isn't driving has the context without re-reading the whole diff.
