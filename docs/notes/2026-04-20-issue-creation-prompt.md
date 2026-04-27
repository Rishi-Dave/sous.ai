# Prompt — Create GitHub Issues from the Post-Hackathon Roadmap

Copy everything between the `---` markers below into a new Claude Code session with `/plan` active. The session will read `docs/sous-ai-roadmap.md`, plan the issue creation carefully, and then (after you approve the plan) use `gh` to create the issues so Rishi and Atharva can each pick which ones to pick up.

---

You're turning `docs/sous-ai-roadmap.md` into real GitHub issues on the `Rishi-Dave/sous.ai` repository using the `gh` CLI. Each `##` section in the roadmap becomes one issue. This is a destructive-on-remote task (creates real issues that land in the repo's issue tracker), so you must go through the full plan-mode workflow and wait for explicit approval before running any `gh issue create` command.

## Repository context

- Repo: `Rishi-Dave/sous.ai` (GitHub), currently on branch `main`
- Two active contributors: **Rishi Dave** (GitHub handle `Rishi-Dave`) and **Atharva** (find his handle in git log — he authored commits on branches like `ad/*` and `atharvanev/*`; grep `git log --format='%an %ae' | sort -u` to identify)
- The roadmap at `docs/sous-ai-roadmap.md` is the source of truth. Read it in full before planning.
- Root `CLAUDE.md` still governs the repo — respect its collaboration rules except where this document specifies otherwise.

## Phase 1 — Explore (single Explore agent is enough)

Launch one Explore agent to answer these questions:

1. Does the repo currently have any open or closed issues? Any existing labels or milestones? Any GitHub project board attached? Use `gh issue list --state all --limit 50`, `gh label list`, `gh project list --owner Rishi-Dave`.
2. What's Atharva's GitHub handle? Grep the git log for commit authors other than `Rishi-Dave`.
3. Is there a `.github/ISSUE_TEMPLATE/` directory, and if so what templates exist? They shouldn't block this work but we should honor them if present.

Also, yourself (main thread), read `docs/sous-ai-roadmap.md` in full. It's the authoritative source; do not summarize or synthesize from memory.

## Phase 2 — Plan (1 Plan agent)

Launch one Plan agent with:
- A copy of the roadmap's section titles + labels + dependencies extracted into a structured list
- The Phase 1 findings
- Instructions to return a detailed execution plan for issue creation

The plan must cover:

1. **Label creation.** The roadmap's "Labels to create" section lists every label used. For each label, say whether it already exists (from the Phase 1 scan) or needs to be created with `gh label create`. Assign a color per label family (priorities get a red→green gradient, types get neutral greys, areas get distinct hues). Don't invent new label names; only use what the roadmap calls out.
2. **Milestone (optional).** Suggest one milestone: `v1 — public beta`, scoped to issues #1–#8 inclusive. Offer to create it or skip based on my preference.
3. **Issue creation order.** Create issues in roadmap order (#1 first, #14 last) so that when you link dependencies in body text via `Depends on #N`, the referenced issues already exist.
4. **Title + body format.** Title = roadmap `## N. Title` with the number stripped. Body = the section content verbatim (Why, What to build, Acceptance criteria, Notes for Claude Code), rendered in Markdown exactly as written in the roadmap. Do not paraphrase or abridge — issue bodies should be a faithful copy.
5. **Dependency linking.** Rewrite `Depends on: #1, #2` lines in the body to use GitHub issue cross-refs once those issues exist (e.g. after #1 is created with issue number 3, `#1` in #2's body becomes `#3`). Maintain a mapping table as you go.
6. **Assignees.** Do not pre-assign any issue. Both contributors should pick what they want to pick up. Leave assignee empty.
7. **`gh` command templates.** Show me the exact `gh issue create` command template with variables (title, body, labels) so I can sanity-check before execution.

## Phase 3 — Review

Read the following small files yourself to validate assumptions:
- `docs/sous-ai-roadmap.md` (confirm label list at the bottom)
- `CLAUDE.md` (confirm partner workflow, branch naming — these shouldn't affect issue creation but may inform issue body copy)
- `.github/pull_request_template.md` if it exists (see if there's a format we should mirror)

Use AskUserQuestion to resolve any of:
- **Create a milestone?** Offer `v1 — public beta` scoped to #1–#8 as the default option.
- **Create a GitHub project board?** Offer a default layout (columns: `Backlog`, `Next`, `In progress`, `Review`, `Done`) with all new issues added to `Backlog`, or a "skip and just create plain issues" option.
- **Any roadmap items to skip?** If I say yes, ask which numbers and drop them from the plan.

Do **not** ask about progress or approval in text — that's what ExitPlanMode is for.

## Phase 4 — Write the final plan

Write your final plan to the plan file. Structure:

1. **Context** (why, one paragraph)
2. **Label strategy** (list: existing / to-create / skip, with chosen colors)
3. **Milestone + project decision** (reflecting user's answer to AskUserQuestion)
4. **Issue creation sequence** (numbered table: roadmap # → planned issue title → labels → dep chain)
5. **Commands to run** (concrete `gh` commands, one per step, with any variables pre-filled)
6. **Verification** (what to check after every 5 issues and at the end: `gh issue list`, spot-check a rendered issue in the UI, confirm dependency refs resolved)
7. **Rollback** (what to do if a mistake happens mid-run: `gh issue close --reason "not planned" <number>` for wrongly-created issues, never `gh issue delete` unless user explicitly asks)

## Phase 5 — ExitPlanMode

Wait for approval. Do not call any `gh issue create`, `gh label create`, `gh milestone create`, or `gh project create` before ExitPlanMode is approved. Listing / reading commands (`gh label list`, `gh issue list`) are fine anytime.

## Execution phase (after approval)

Once the plan is approved:

1. Create labels first (all of them, as a batch). Skip ones that already exist.
2. Create the milestone (if chosen).
3. Create the project board (if chosen) and note its ID.
4. Create issues in roadmap order. For each: `gh issue create --title ... --body-file <tmp>.md --label <csv>` with body pulled from the corresponding roadmap section and dependency references rewritten to the issue numbers assigned so far.
5. After every 5 issues, run `gh issue list --limit 20` and print the titles so the user can sanity-check progress.
6. After all issues are created, run a final `gh issue list --state open --limit 30` and paste the output back. This is the "done" signal.

## Rules

- **Body fidelity.** Issue bodies should read like the roadmap section. Do not rewrite. The only allowed transformation is replacing `#1`, `#2`, etc. with the actual created issue numbers.
- **No assignees.** Leave every issue unassigned so Rishi and Atharva can pick freely.
- **Idempotency.** If the session is interrupted and restarted, running the plan again should not create duplicates. Before creating each issue, check `gh issue list --search "<title>"` to see if it exists. If it does, skip it.
- **Don't push code.** This task only touches GitHub issues, labels, milestones, and possibly a project board. No commits, no branches, no file changes in the working tree except the plan file itself.
- **If `gh` isn't authenticated**, stop and ask the user to run `gh auth status` — do not try to work around auth failures.

## Output file for the plan

Write your plan to the standard plan-mode location. When you're done executing, also append a short "Execution log" section to the plan file with: timestamp of each issue creation batch, any issues that already existed and were skipped, and final issue count.

---
