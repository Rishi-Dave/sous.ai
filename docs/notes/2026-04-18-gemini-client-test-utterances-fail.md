# gemini_client / test_utterances flake observed during rh/wake-word verification

**Date:** 2026-04-18
**Branch where observed:** `rh/wake-word` (also reproduces on clean `main`).
**Test:** `backend/tests/unit/test_utterances.py::test_simple_ingredient_with_qty`

## Observation

While running `cd backend && uv run pytest -x` to verify the `rh/wake-word` PR, the first failing test was `test_simple_ingredient_with_qty`. Stashed the wake-word changes, switched to `main`, re-ran the same single test — same failure. So this is **pre-existing on main**, not caused by `rh/wake-word`.

The test calls Groq live (HTTP 200 returned) and then asserts on the parsed response. The assertion error itself wasn't captured in the run because `-x` aborted at the first failing test before stderr-on-failure output finished.

## Why I didn't dig further

- `gemini_client/` is Atharva's domain (root CLAUDE.md ownership rule).
- The failure was not introduced by my PR.
- The smoke test (`tests/smoke/`) — the one in Rishi's DoD — passes 2/2.
- `tests/unit/test_utterances.py` is the live-Groq harness; could be a transient model-output drift or a prompt change interacting badly with a fixture.

## What Atharva should look at

- Run `uv run pytest tests/unit/test_utterances.py::test_simple_ingredient_with_qty -v` and capture the full assertion diff.
- Likely candidates: model returned `unit="cloves"` (plural) instead of `"clove"` (singular per the system prompt), or `qty=2` returned as `2.0` vs `2` and the assertion is type-strict.
- If it's a model-output drift, this is the kind of thing the prompt-tuning loop should catch — consider making the unit-strictness assertion a normalised compare (`unit.rstrip('s')`) or moving to a tolerance-based JSON-schema check.

No GitHub issue opened yet — leaving that to Atharva once he's looked at the actual diff, since it might just be a flake.
