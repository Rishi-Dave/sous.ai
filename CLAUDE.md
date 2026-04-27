# Sous Chef — Root CLAUDE.md

This file is loaded on every session and every subagent spawn. Keep it lean — reference material goes into `.claude/skills/` and `.claude/memory/`.

## Project

Sous Chef: an AI voice sous chef on an Expo + FastAPI + Gemini + ElevenLabs + Edamam + Supabase + Picovoice Porcupine stack. The hackathon prototype shipped; the project is now being pushed to production quality.

Two devs — **Rishi** (branch prefix `rh/`) and **Atharva** (prefix `ad/`). Free-for-all on issues: either dev can pick up any ticket; branch prefix identifies who's driving the change, not who owns the code. See `.claude/memory/design-doc-summary.md` before substantive work. Do not re-read the full design doc (`docs/design.md`) unless the summary is insufficient; update the summary when the doc changes.

## Architecture rules (non-negotiable)

Distilled from design doc §4, §7. Full detail in the summary.

1. **Only one audio consumer at a time.** Stop Porcupine before starting `expo-av`. Wait 300ms after TTS playback before re-arming Porcupine.
2. **150ms ding on wake-word detection** — acoustic confirmation.
3. **Mobile never talks directly to Gemini / ElevenLabs / Edamam.** Backend is the only server.
4. **Backend is stateless** except for Supabase state.
5. **`gemini_client` is a pure function.** `(audio, session_ingredients, pending_clarification) → UtteranceResponse`. Imported, not reimplemented.
6. **API contract lives in** `docs/design.md` §7 — summary in `.claude/memory/design-doc-summary.md`. Any change to request/response shapes is a breaking change; flag it explicitly and run `integration-checker`.

## Git rules (HARD)

Strict branching is always on. Production quality means we don't commit to `main` even when no one else is looking.

1. **Never commit to `main`.** If on `main`, immediately `git switch -c <prefix>/<slug>` — `rh/` for Rishi, `ad/` for Atharva. Kebab-case slug, ≤4 words. Examples: `rh/utterance-endpoint`, `ad/gemini-clarification`. The prefix reflects who's driving the change; either dev can work in any part of the codebase.
2. **`git push` is allowed; `git push --force` is not** — the deny list blocks force push. Before any push, show the diff + one-sentence summary so the dev can object before it hits the remote.
3. **Never `git reset --hard`, never `--no-verify`, never `--no-gpg-sign`.** Deny list blocks these.
4. **Never auto-resolve merge conflicts.** On conflict: stop, show the markers, wait.
5. **Commits:** small, focused, "why" over "what". Never `git add -A` or `git add .` — name specific files.
6. **PRs as drafts.** Use the template at `.github/pull_request_template.md`.
7. **Rebase, don't merge.** `git rebase origin/main` to pick up upstream.

Full reference: `.claude/skills/git-partner-workflow/SKILL.md`.

## Environment discipline

- **Python: `uv`.** Add deps with `uv add <pkg>`. Never hand-edit `pyproject.toml` or `uv.lock`. Sync with `uv sync` on every pull.
- **Node: `npm`.** Use `npm ci` on checkout (not `npm install`) so the lockfile is honored.
- **Verify the venv is active** before any `uv run` / `pip` / `python` command. `which python` sanity check if unsure.
- **Never install to system Python.**
- **New dep + the code using it land in the same PR.** Name the dep in the PR description.
- **After any dep change, run the full test suite** before declaring done.
- **`.env` never committed.** Enforced by `.gitignore` + the deny list. If you need a new env var, update `.env.example` in the same commit and flag the key in the PR description.
- **Never log, echo, or fixture-in secrets.**

Dep-failure runbooks: `.claude/skills/fastapi-patterns/SKILL.md`, `.claude/skills/expo-workflow/SKILL.md`.

## Context discipline (the reason subagents exist)

Main-thread context is the scarcest resource. Every file Claude reads becomes permanent context for the rest of the session.

**Default to subagent delegation for:**
- Any read >500 lines.
- Design-doc lookups — use the `doc-lookup` subagent. It consults `.claude/memory/design-doc-summary.md` first and returns ≤2 paragraphs.
- Test runs — use the `test-runner` subagent. It returns `{passed, failed, failures[]}`, not raw output.
- Log inspection — use `tail`/`grep`, never `cat` a full log.
- Debugging an isolated failure — use the `debugger` subagent. It proposes a diff; main thread applies.
- Post-change review — use the `code-reviewer` subagent before every PR.
- API contract checks after schema changes — use `integration-checker`.
- Planning a non-trivial feature before coding — use `planner`.

**File-based handoffs.** Intermediate artifacts (plans, debugging triage, migration docs) go to `docs/notes/<YYYY-MM-DD>-<slug>.md`. Main thread retains the path, not the content.

**Do NOT edit this CLAUDE.md mid-session.** It's the most-cached prefix in the API; edits invalidate the prompt cache and cost tokens on every subsequent turn. Volatile state goes in `.claude/memory/` or `docs/notes/`.

**Start a fresh session per major feature.** CLAUDE.md + `.claude/memory/decisions.md` + `docs/notes/` carry what matters across sessions. The chat history does not.

**~50% context rule.** When main-thread context approaches half of max, proactively suggest: `/compact`, writing state to a note, starting fresh, or delegating more.

**Targeted tool use:**
- `Read` with line ranges when a file exceeds ~200 lines.
- `Grep` with narrow patterns — no recursion into `node_modules`, `.venv`, `.expo`.
- `Bash` output: `head`, `tail`, `grep` — never `cat` a log.
- `pytest -x --tb=short` for fast-fail; never verbose unless you already know one test is failing.
- `git log --oneline -20`, not `git log`.

## Subagent protocol

When dispatching a subagent:

1. Pass a task description + a list of file paths, never file contents.
2. Expect a structured return per the agent's frontmatter.
3. Integrate the structured summary. Discard any accidental prose.
4. Never pass a subagent's raw output into another subagent — synthesize first.

Subagent definitions live in `.claude/agents/`.

## Self-debug loop

When something fails:

1. **Classify** — syntax, type, runtime, integration, semantic ("ran but wrong"), environment. Different classes → different strategies.
2. **Reproduce first.** No speculative patches. If you can't reproduce, say so.
3. **Read the actual error + source**, don't pattern-match on the error string.
4. **Hypothesis → experiment → update.** State it, design the smallest experiment, run it, refine.
5. **Max 3 iterations**, then escalate (open a GitHub issue or ping the other dev) with what you tried and what's still unknown.
6. **Narrow scope when stuck** — `git log --oneline` and consider bisecting recent changes.
7. **Never bypass.** Don't skip hooks, disable tests, or silence errors to "make it work."

Specific runbooks: `.claude/skills/voice-pipeline-debug/SKILL.md`, `.claude/skills/expo-workflow/SKILL.md`.

## Definition of done

A change is done only when **all** of the following are true:

1. **Tests pass.** `pytest -x` green for backend. `npm test` green for mobile. The `test-runner` subagent confirms.
2. **Smoke test passes.** `cd backend && uv run pytest tests/smoke/ -x` — the `/sessions → /utterance → /finalize` integration test.
3. **`code-reviewer` subagent returns `status: pass`.**
4. **If API contract touched, `integration-checker` returns `consistent: true`.**
5. **No hardcoded secrets.** No `.env` in diff.
6. **Branch is `<prefix>/<slug>`, not `main`.**
7. **PR template fields filled in.**

Per-module DoD:

- **M1 wake word + mic** — state machine transitions clean; 300ms re-arm buffer present; ding plays.
- **M2 utterance processing** — `test_utterances.py` ≥80% in the `gemini_client` test harness.
- **M3 clarification flow** — `pending_clarification` written and read across utterances; ≥3 test cases for the round-trip.
- **M4 Q&A handler** — `answer` ≤2 sentences; TTS renders it.
- **M5 macro computation** — Edamam failure on one ingredient does not fail the whole recipe.
- **M6 summary UI** — summary screen renders with real `macro_logs` row.

## Scoped CLAUDE.md creation

When Claude first enters `mobile/`, `backend/`, or `backend/gemini_client/` and finds no `CLAUDE.md`, copy from the template at `.claude/templates/scoped-claude-md/{mobile,backend,gemini_client}.md`. Do this before doing substantive work in the directory.

## Pointers

- **How-to for the current stack:** `.claude/skills/` — expo-workflow, fastapi-patterns, supabase-ops, git-partner-workflow, voice-pipeline-debug, release-readiness.
- **What we decided:** `.claude/memory/decisions.md` (append-only). When a non-trivial architectural call is accepted, append an entry (date, decision, rationale, alternatives).
- **Compressed design doc:** `.claude/memory/design-doc-summary.md`.
- **In-flight working notes:** `docs/notes/<YYYY-MM-DD>-<slug>.md`.
- **Ephemeral scratch:** `.claude/memory/scratch/` (never referenced across sessions).
- **Authoritative spec:** `docs/design.md` — prefer the summary; re-read only if the summary is insufficient, and update the summary after.

## Announce intent before tool calls

Before the first tool call in a turn, one sentence on what you're about to do. On substantive findings, brief updates. Short over silent.
