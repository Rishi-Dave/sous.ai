# backend/ — FastAPI orchestrator

You are working in the backend. The root `CLAUDE.md` is authoritative; this file layers backend-specific rules on top.

## Dev loop

```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# http://localhost:8000/docs is the primary manual-test surface
```

Swagger at `/docs` lets you upload audio blobs and fire real `/utterance` calls without a mobile client in the loop.

## Layout

```
backend/
├── .venv/                     uv-managed; gitignored
├── pyproject.toml             uv dependencies (committed)
├── uv.lock                    committed; never hand-edit
├── app/
│   ├── main.py                FastAPI instance + middleware
│   ├── schemas/               Pydantic models — add schema FIRST, then route
│   ├── routes/                /sessions, /utterance, /finalize, /recipes
│   ├── deps.py                Depends() providers (Supabase client, settings)
│   ├── db.py                  Supabase wrapper
│   ├── tts.py                 ElevenLabs streaming wrapper
│   └── nutrition.py           Edamam wrapper
├── gemini_client/             Gemini client module. See its own CLAUDE.md for the contract.
├── gemini_client/evals/       160-case classification eval suite; baseline-gated.
├── tests/
│   ├── smoke/                 integration: /sessions → /utterance → /finalize
│   └── unit/                  per-route happy + failure paths
└── test_audio/                reference wav/m4a files for reproducible testing
```

## Rules

- **Schema-first.** New endpoint = new Pydantic model in `app/schemas/` → route in `app/routes/` → happy-path + one failure-path pytest. In that order.
- **Dependency injection, always.** Supabase client, settings, Gemini client — all via `Depends()`. Never instantiate inline. Makes mocking in tests one-line.
- **Secrets via `pydantic-settings`.** Load from `.env`. Never hardcode, never log.
- **Import from `gemini_client`.** Either dev may edit it per the partner-workflow feedback memory; branch prefix identifies the driver, not ownership. Changes to the public contract (`process_utterance` signature, `UtteranceResponse` / `ParsedIngredient` fields) are breaking — flag explicitly in the PR description and coordinate so the mock in `backend/app/` stays in sync. For bugs that surface during integration, capture context in `docs/notes/<date>-gemini-client-<slug>.md` and link it from the PR.
- **Run the eval suite after any gemini_client or prompt change.** `cd backend && uv run pytest gemini_client/evals/ -q` prints a per-intent scorecard gated on `baseline_scores.json`. Regressions below baseline fail the session; intentional improvements require a baseline bump with justification in the PR.
- **Supabase migrations via CLI only.** `supabase migration new <name>` → edit the generated SQL → `supabase db reset` to apply. Never edit tables through the dashboard SQL editor — that creates silent drift between Rishi's and Atharva's local DBs.
- **Smoke test is the completion bar.** `uv run pytest tests/smoke/ -x` must pass before declaring any backend change done.

## Dependencies

- `uv add <package>` — never hand-edit `pyproject.toml` or `uv.lock`.
- New dep + the code using it land in the same commit/PR, and the dep name appears in the PR description.
- After any dep change, run the full test suite before declaring done.

## Error handling boundary

- Inside a route: raise `HTTPException` with a specific status + detail. Don't let exceptions leak as 500s unless they are truly unexpected.
- Edamam parse failure on a single ingredient → skip that ingredient, log it, keep the recipe. Don't fail `/finalize`.
- Gemini returning non-schema JSON → 502 with a `gemini_parse_failed` detail; surface to mobile.
