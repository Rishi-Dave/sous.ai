## What

<1–2 sentences describing the change.>

## Why

<Link to issue / design-doc section / relevant note in `docs/notes/`.>

## How to test

<Commands or steps. Include whether the smoke test passes.>

## Checklist

- [ ] Tests added/updated and passing (`uv run pytest` / `npm test`)
- [ ] Smoke test green: `cd backend && uv run pytest tests/smoke/ -x`
- [ ] No `.env` in diff; `.env.example` updated if new keys added
- [ ] API contract unchanged, OR change documented in `docs/notes/` and flagged to Atharva
- [ ] Rebased on `main` (not merged)
- [ ] `CLAUDE.md` updated if architecture changed
- [ ] No edits under `backend/gemini_client/` (unless you are Atharva)
