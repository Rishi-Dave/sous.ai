# sous.ai — Post-Hackathon Roadmap

Prioritized list of changes for Claude Code to convert into GitHub issues. Ordered high-impact to low-impact. Each item is scoped to be a standalone issue: includes context, concrete acceptance criteria, and rough effort estimate.

**Claude Code: create one issue per `##` section below. Use the section heading as the issue title (strip the number). Use the subsections as the issue body. Apply the suggested labels. Link dependencies where noted.**

## Current state (2026-04-20, end of hackathon)

Baseline for every issue below — do not re-plan work already shipped on `main`.

**Mobile (Expo SDK 54, React Native, TypeScript strict):**
- Voice loop state machine (Armed → Listening → Processing → Speaking) with single-audio-consumer rule enforced
- Editorial UI shipped: MicCard with concentric rings + halo + bouncing-dot processing + waveform speaking, CalorieRing SVG draw-in, MacroTable, hairline rule-off lists, Wordmark "Sous / AI" hero
- Cookbook route live: list + open saved recipe + **delete with confirm + optimistic remove**
- Home screen shows "Open your cookbook" link + busy dots, uses `useFocusEffect` to reset busy state
- Cook-time measured on cooking screen and sent to `/finalize`, displayed on summary

**Backend (FastAPI on Railway + Supabase hosted DB):**
- Live at `https://sousai-production.up.railway.app`
- Endpoints: `POST /sessions`, `POST /utterance`, `POST /finalize`, `GET /recipes/{id}`, `DELETE /recipes/{id}`, `GET /users/{user_id}/recipes`, `GET /tts/stream/{audio_id}`, `GET /healthz`
- `cook_time_seconds` column on `recipes`, threaded through finalize + list + get-by-id
- LLM path (module name is `gemini_client` for historical reasons; actual stack is **Groq**): `groq/whisper-large-v3-turbo` for STT, then `groq/llama-3.1-8b-instant` with function-calling for intent classification + ingredient extraction + ack generation + in-loop `get_nutrition` tool call during utterance handling
- ElevenLabs streaming TTS wired with voice ID `DODLEQrClDo8wCz460ld`
- Edamam per-ingredient macro lookup called from `/finalize` (separate from the in-utterance tool-call path), with LLM fallback for unresolvable items (flagged `estimated: true`)

**Known rough edges (to inform issues below, not separate to-do's):**
- Picovoice wake word is code-complete but disabled in demo (no key); tap-to-wake is the only path that ships
- Demo user is hardcoded UUID `00000000-0000-0000-0000-000000000001`; no real auth
- Past-tense or narration utterances ("added oil", "adding oil to the pan") classify as small_talk instead of add_ingredient — imperative-only phrasing works reliably
- Clarification state (`pending_clarification` field) threads correctly in the happy path but has at least one observed case where `is_resolving=False` despite a pending clarification

**Collaboration note (2026-04-20 onward):**
Post-hackathon, Atharva and Rishi can both edit any file including `backend/gemini_client/`. The git deny rule that blocked Rishi's edits in that directory has been retired. Branch + PR discipline stays on per `CLAUDE.md`.

---

## 1. Build an NLU eval harness before any refactor

**Labels:** `infra`, `testing`, `priority:critical`, `backend`
**Effort:** 1 evening (~4 hours)
**Depends on:** nothing — do this first

**Why:** We cannot safely refactor the NLU path, swap models, or change prompts without a reproducible test set. Every other item on this roadmap should run this harness before merge. Without it, we will silently regress classification accuracy on utterances that used to work.

**What to build:**
- `backend/gemini_client/evals/` directory
- `utterances.yaml` with 150 labeled cases covering: `add_ingredient` (clear imperative), `add_ingredient` (vague quantities — "splash", "pinch", "handful"), **`add_ingredient` (past-tense / narration — "added oil", "adding oil to the pan", "throwing in some garlic" — these currently misclassify as `small_talk`)**, `question` (substitutions, techniques, timing), `acknowledgment` (responses to prior clarifications), `small_talk`, `finish_recipe`, and the ambiguous cases we've hit during testing
- Each case has: `utterance_text` (or path to audio fixture), `expected_intent`, `expected_ingredient` (if applicable), `pending_clarification` context (if applicable), `notes`
- A pytest-based runner: `uv run pytest backend/gemini_client/evals/` prints a scorecard (accuracy per intent, list of failures with diffs)
- A CI job that runs the eval suite on every PR touching `gemini_client/` or prompt files, fails the build if accuracy drops below a committed baseline

**Acceptance criteria:**
- [ ] 150+ labeled utterances committed
- [ ] Runner prints per-intent accuracy and flags regressions against `baseline_scores.json`
- [ ] Baseline file is committed; any score drop requires explicit baseline update in the PR
- [ ] README documents how to add a new eval case when a bug is found in production

**Notes for Claude Code:** Start by grepping the existing test suite for any existing utterance fixtures — harvest those first. Then add cases for every edge case named in `docs/design.md` and `CLAUDE.md`. Do NOT generate synthetic utterances with an LLM for the eval set; use real examples from our own testing or write them by hand. Synthetic evals test whether the model agrees with itself, not whether the system works.

---

## 2. Refactor the single-prompt NLU into routed handlers

**Labels:** `refactor`, `backend`, `priority:critical`, `architecture`
**Effort:** 1 weekend (~12 hours)
**Depends on:** #1 (eval harness must exist before refactor)

**Why:** The current architecture is one giant Gemini prompt doing intent classification, ingredient extraction, clarification handling, and ack generation in a single call. This does not scale to upcoming features (recipe mode, daily macros, coach mode). A single prompt trying to do planning + routing + extraction + formatting becomes fragile and hard to evolve. We need to split into a small router + focused per-mode handlers.

**What to build:**

Target structure under `backend/gemini_client/`:
```
gemini_client/
├── __init__.py            # exports process_utterance (preserve current signature)
├── router.py              # classify mode: freestyle | recipe | coach_query | qa
├── handlers/
│   ├── freestyle.py       # add_ingredient, acknowledgment intents (current behavior)
│   ├── qa.py              # question intent, substitution/technique answers
│   └── small_talk.py      # fallback
├── prompts/               # each handler's system prompt in a separate .txt file
├── context.py             # assemble_context(session, mode) — pulls ingredients, pending_clarification
└── schemas.py             # Pydantic types (already exist, preserve)
```

Flow:
1. `process_utterance` is the single entry point (unchanged signature — backward compatible with current FastAPI route)
2. It calls `router.classify()` — a small, fast Gemini Flash call with a tight 4-way classification prompt OR a heuristic based on session state (if `current_recipe_id` is set, it's recipe mode; etc.)
3. It calls `context.assemble()` to build the per-mode context bundle
4. It dispatches to the appropriate handler, each with its own focused system prompt
5. Handler returns the same `UtteranceResponse` shape we already use

**Acceptance criteria:**
- [ ] Eval harness from #1 scores ≥ current baseline after refactor (no regression)
- [ ] Each handler's system prompt is ≤ 40 lines (vs current monolithic prompt)
- [ ] Router classification is testable independently with its own eval subset
- [ ] `process_utterance` signature and response shape unchanged — no mobile client changes required
- [ ] Recipe mode handler is stubbed (returns "recipe mode coming soon" ack) to reserve the routing slot for #6

**Notes for Claude Code:** Do NOT introduce LangGraph, LangChain, or any agent framework in this refactor. Plain Python, plain async functions, plain dispatch. We will revisit orchestration frameworks only after this refactor is stable and we have a clear need. The goal here is structural clarity, not framework adoption.

---

## 3. Upgrade classification model + confidence-based fallback

**Labels:** `reliability`, `backend`, `priority:high`
**Effort:** 1 afternoon (~4 hours)
**Depends on:** #1, #2

**Why:** Groq Llama 3.1 8B was the right pick for hackathon latency (sub-second responses). For a real product with users who track macros daily, classification reliability matters more than $0.50/month in API cost. A larger or more capable model is noticeably better on ambiguous cases (past-tense phrasing, vague quantities, implicit intents). Additionally, the model should ask for clarification instead of guessing when it's unsure — the clarification infrastructure exists; we just need to wire in a confidence threshold.

**What to build:**
- Pick a classifier upgrade and commit to it: options are `groq/llama-3.3-70b-versatile` (same provider, bigger model, minimal migration), `openai/gpt-4.1-mini`, `anthropic/claude-haiku-4.5`, or `gemini-2.5-flash`. Run the #1 eval suite across candidates and pick the best accuracy-per-dollar.
- Keep the current 8B model for the extraction / tool-call handler where speed matters more than classification quality.
- Add structured output requesting `confidence: float` (0.0–1.0) alongside each classification.
- If `confidence < 0.7` on router OR `confidence < 0.75` on ingredient extraction, route to clarification path instead of committing the action.
- Clarification prompt template: "I want to make sure I got that right — did you mean `<best-guess>` or `<second-guess>`?"
- Log every low-confidence event to a structured log line so we can tune thresholds empirically.

**Acceptance criteria:**
- [ ] Classifier upgrade chosen with eval data backing the pick
- [ ] All LLM calls return structured confidence scores
- [ ] Low-confidence utterances route to clarification instead of guessing
- [ ] Threshold values live in a config module, not hardcoded in handlers
- [ ] Eval harness grows a "confidence calibration" report: on cases we got wrong, what was the confidence?

**Notes for Claude Code:** Thresholds of 0.7/0.75 are starting guesses. The real values come from running evals with confidence logged and picking the threshold that maximizes precision without nuking recall. Include a one-time script that suggests an optimal threshold based on the eval run. Do not assume we're staying on Groq — the eval harness exists precisely to let us swap providers with data, not vibes.

---

## 4. Daily macro tracking with agent-visible running totals

**Labels:** `feature`, `priority:high`, `full-stack`
**Effort:** 1 weekend (~14 hours)
**Depends on:** #2 (handlers must exist so we can inject daily-total context cleanly)

**Why:** This is the feature that transforms the app from a single-meal logger into a daily-use tool with compound value. Single-meal tracking is disposable; daily totals against goals is the loop that retains real macro trackers. It also unlocks coach-mode-lite for free: once the agent sees current daily totals and goals, it can naturally surface adjustments without a separate "coach mode" being built.

**What to build:**

Backend:
- Migration: add `daily_calorie_goal INT`, `daily_protein_goal_g INT`, `daily_fat_goal_g INT`, `daily_carb_goal_g INT` to `profiles` (nullable; no onboarding for now, user edits in a settings screen)
- View or materialized rollup: `daily_macro_totals(user_id, date, calories, protein_g, fat_g, carbs_g)` aggregating from `macro_logs` joined through `recipes.user_id` and `recipes.finalized_at::date` (the table actually stores `created_at` on both `recipes` and `macro_logs`, but the meaningful day is when the recipe was *finalized*, not when the row was inserted)
- New route: `GET /daily-macros?date=YYYY-MM-DD` returns today's totals + goals + remaining
- Context assembly (#2) includes today's totals + goals in every handler's context bundle

Mobile:
- Home screen widget: stat card showing "1,420 / 2,200 cal · 82g / 150g protein" with a thin ring/bar for each macro
- Settings screen (new): goal editor, manual numeric inputs, saves to profile
- Refresh daily-totals on app foreground and after every `/finalize`

Agent behavior:
- Freestyle handler's system prompt mentions current daily totals — the model can reference them naturally ("heads up, that'll put you at 1,800 cal for the day")
- Do NOT pre-program coaching behavior. Let the model surface adjustments organically from context; if it's too chatty, constrain via prompt, not via code

**Acceptance criteria:**
- [ ] Migration applied, daily totals accurate against test data
- [ ] Home screen shows running daily totals, updates after each finalized recipe
- [ ] Settings screen allows goal editing, persists to profile
- [ ] Agent responses reference daily context when relevant (verified via 5+ eval cases)
- [ ] Feature works across timezone edges (user cooking at 11:45 PM vs 12:15 AM must roll over correctly — use user's local date, not UTC)

**Notes for Claude Code:** Timezone handling is the sneaky bug here. Store the user's timezone on the profile (pull from the device on first launch) and compute "today" in that timezone when rolling up. Do not use UTC midnight.

---

## 5. Self-use and private beta (7-day soak test)

**Labels:** `product`, `priority:high`, `qa`
**Effort:** 2 weeks of calendar time, ~4 hours of engineering to set up
**Depends on:** #4 — don't beta without daily macros, the app isn't retention-shaped yet without them

**Why:** We have no real-world signal on this product. Before App Store deployment (#8), we need to know what breaks when a motivated user cooks with it daily for a week. The author using it personally for 7 consecutive days is the minimum bar; getting 5–10 macro-tracking friends on TestFlight is the real bar.

**What to build:**
- TestFlight pipeline: `eas build --profile preview` configured, submission workflow documented in `docs/testflight.md`
- Feedback channel: a `/feedback` endpoint + minimal in-app "Report an issue" surface that posts to a Supabase `feedback` table (text, session_id, timestamp, device_info)
- Crash reporting: Sentry free tier wired into the mobile app and backend
- A weekly digest script: summarizes feedback + crashes + usage metrics for review

**Acceptance criteria:**
- [ ] TestFlight build submitted and reviewed
- [ ] 5+ external users installed, each with >3 completed recipes in 7 days
- [ ] Feedback/crash data flowing to a dashboard we actually look at
- [ ] A prioritized bug list emerges from the soak test, becomes input to #7

**Notes for Claude Code:** This is not mostly an engineering task — it's a product task with engineering scaffolding. The engineering is ~4 hours (Sentry, feedback endpoint, TestFlight config). The rest is calendar time while users actually use the app. Do not skip the calendar time by declaring it "done" after the infrastructure is up.

---

## 6. Recipe assistance mode

**Labels:** `feature`, `priority:high`, `full-stack`
**Effort:** 1 weekend (~14 hours)
**Depends on:** #2 (recipe handler slot already stubbed), #4 (daily macro context for the final summary)

**Why:** This is the feature that differentiates sous.ai from "a voice UI on top of MyFitnessPal." No other app has a voice assistant that guides you through a recipe AND tracks what you actually cooked (with deviations). The deviation-tracking is the killer feature: if the recipe says "2 tbsp butter" and the user says "a splash of butter," we track the delta and adjust macros — something no recipe app does today.

**What to build:**

Backend:
- Migration: `recipes.source_url` (nullable), `recipes.steps` (JSONB array of `{index, instruction, expected_ingredients}`), `recipes.mode` (`'freestyle' | 'guided'`)
- New route: `POST /recipes/import { url }` — fetches page, uses Gemini to parse into structured ingredients + steps
- New route: `POST /recipes/:id/advance-step` — increments current step, returns next instruction
- Recipe handler (replace stub from #2): handles "what's next", "repeat that", "I added X instead" utterances with current-step context

Mobile:
- Recipe import screen: URL paste input, shows parsed recipe preview
- Recipe mode UI: step-by-step card replaces the freestyle ingredient card, shows current step, progress indicator, deviation log
- Voice commands: "what's next", "repeat", "go back", "I added X instead of Y" — all route to recipe handler

Deviation handling:
- When user reports a deviation ("used 1 tbsp instead of 2"), log it to `ingredients` with a `deviation_from` reference
- Final macro calculation uses actual ingredients as-cooked, not recipe-as-written

**Acceptance criteria:**
- [ ] URL import works on 5 major recipe sites (NYT Cooking, AllRecipes, Serious Eats, Food Network, BBC Good Food)
- [ ] Step-by-step voice guidance progresses correctly via voice commands
- [ ] Deviation tracking reflected in final macros (demo: cook a recipe with 2 deliberate deviations, verify macros differ from recipe-as-written)
- [ ] Recipe mode coexists with freestyle mode — router correctly dispatches based on session state
- [ ] Eval suite extended with 30+ recipe-mode utterances

**Notes for Claude Code:** For URL parsing, try schema.org Recipe microdata first (most major recipe sites publish it) — falls back to Gemini only if parsing fails. This saves LLM cost and gives more reliable structured data for the sites that support it.

---

## 7. Fix top issues surfaced by the 7-day soak test

**Labels:** `bug`, `priority:high`
**Effort:** 1 weekend (~12 hours)
**Depends on:** #5

**Why:** Don't ship to the App Store with known issues from beta. The specific bugs cannot be listed yet (they depend on what users surface), but the work slot is reserved.

**What to build:**
- Review all feedback and crash reports from #5
- Prioritize: classification accuracy issues → UI bugs → feature gaps → polish
- Fix the top 5–7 issues, triage the rest into backlog

**Acceptance criteria:**
- [ ] All P0/P1 bugs from beta are closed
- [ ] Eval suite updated with any utterances that failed in production
- [ ] No regressions — full test + eval suite green

---

## 7.5. Real multi-user authentication

**Labels:** `feature`, `priority:critical`, `full-stack`, `security`
**Effort:** 1 weekend (~12 hours)
**Depends on:** #7 (don't break auth mid-beta), blocks #8 (App Store won't pass a hardcoded-user app)

**Why:** The entire app currently runs as a single seeded UUID `00000000-0000-0000-0000-000000000001`. Every user would see every other user's cookbook. This is the one issue that absolutely cannot ship to the App Store. Supabase already has an auth layer; it's just unused.

**What to build:**

Backend:
- Enable Supabase Row-Level Security on `profiles`, `recipes`, `ingredients`, `macro_logs`. Policies: users can only read/write rows where `user_id = auth.uid()`.
- FastAPI: accept a `Authorization: Bearer <supabase_jwt>` header, verify it with Supabase's public JWKS, populate a `current_user_id` dependency
- Replace every route's `user_id` source from the hardcoded UUID to `Depends(current_user_id)`
- Delete or gate the seeded demo user path behind an env flag for local development only

Mobile:
- Sign-in screen using Supabase Auth (start with email magic-link or OAuth; Apple Sign-In is required for App Store anyway — lead with that)
- Store the JWT in `expo-secure-store`, refresh on foreground
- Attach the JWT to every backend fetch via a shared client wrapper
- Sign-out flow in a settings screen

Migration:
- For any existing seeded demo data, either delete on first real login or stash it behind a "demo" flag

**Acceptance criteria:**
- [ ] New users can sign up, sign in, sign out
- [ ] RLS verified — user A's cookbook is invisible to user B (automated test against real Supabase)
- [ ] All routes enforce auth; unauthenticated requests return 401
- [ ] Apple Sign-In works and is the primary method (App Store requirement if any third-party auth exists)
- [ ] Session persists across app restarts; refresh tokens handled

**Notes for Claude Code:** This is the only issue in the roadmap where RLS policies are as important as the route code. Write the Supabase policies as SQL migrations (not via dashboard), test them with a pytest suite that spins up two user contexts and verifies isolation. Do not rely on "the backend will check" — RLS is the real security boundary.

---

## 8. App Store submission

**Labels:** `release`, `priority:medium`, `infra`
**Effort:** 1 weekend (~14 hours, mostly non-code)
**Depends on:** #7, **#7.5 (auth must ship before submission)**

**Why:** Get the app to real users beyond TestFlight. App Store credibility is a non-trivial signal for a portfolio project — "shipped on App Store with N users" on a resume reads differently than "TestFlight beta."

**What to build:**
- Privacy policy: hosted page describing what we record, what we send to Gemini, what we retain (raw audio NOT retained beyond the request; transcriptions stored in DB; macro data stored indefinitely)
- App Store metadata: description, keywords, screenshots (6.7" and 6.1" iPhone), preview video (30 sec)
- App Store privacy questionnaire: voice/mic is sensitive — be specific and honest, specifically that voice is transcribed via Gemini and raw audio is not retained
- Cost guardrails: add rate limiting per-user per-day so a single user cannot burn through Gemini/ElevenLabs quotas — essential before any public install
- Monetization decision: document whether v1 is free/ads/subscription/one-time — even if the answer is "free with usage limits," write it down

**Acceptance criteria:**
- [ ] App approved and live on App Store
- [ ] Privacy policy hosted and linked from app + App Store listing
- [ ] Per-user rate limits enforced (max N utterances/day, configurable)
- [ ] Cost per active user per day calculated and documented (target <$0.20)

**Notes for Claude Code:** Apple's most common rejection for voice apps is insufficient disclosure of what happens to recorded audio. Err on the side of being over-specific in the privacy policy. Include the explicit sentence "Raw audio is sent to Google Gemini for transcription and is not retained by our servers beyond the duration of the request."

---

## 9. Cookbook search, filter, and richer recipe management

**Labels:** `feature`, `priority:medium`, `mobile`, `backend`
**Effort:** 1 weekend (~10 hours)
**Depends on:** #6 (cookbook becomes much more valuable once it contains guided-cook recipes)

**Why:** The cookbook already lists saved recipes with name / calories / cook-time / finalized-at / delete (shipped at hackathon). The missing pieces are search, filter, and edit — the features that turn recipe history into personal data with compound retention value. Filter by ingredient ("what have I made with chicken?"), by date range, by macro range ("high-protein meals under 600 cal"), by cook-time range.

**What to build (on top of the existing `/users/{user_id}/recipes` endpoint and cookbook route):**
- Backend: full-text search on recipe name + ingredient names (Postgres `tsvector` indexed). Extend the list endpoint to accept `q`, `ingredient`, `max_calories`, `min_protein`, `from_date`, `to_date` query params.
- Mobile: search bar at the top of the cookbook route, with debounced input
- Mobile: filter drawer with macro range sliders, date picker, ingredient chips
- Mobile: recipe detail screen — full ingredient list, macros, notes, delete (already exists), **rename**, **add notes** (new text field `recipes.notes`)
- Backend: `PATCH /recipes/{id}` accepting `recipe_name` and `notes` updates

**Acceptance criteria:**
- [ ] Search returns results in <200ms on a library of 500 recipes
- [ ] Filters compose (date + macro + ingredient simultaneously)
- [ ] Rename + notes persist across sessions
- [ ] Existing delete flow preserved (already has confirm dialog)

---

## 10. Barcode scanning for packaged ingredients

**Labels:** `feature`, `priority:medium`, `mobile`
**Effort:** 1 day (~8 hours)
**Depends on:** nothing (can parallelize)

**Why:** "A scoop of protein powder" is inherently imprecise. For users actually hitting macro targets, scanning the label is strictly better. This is also the demo feature that makes the app feel modern — judges at a hypothetical future demo would react to a camera-based ingredient entry much more than to voice-only.

**What to build:**
- `expo-camera` integration for barcode scanning (UPC/EAN)
- Lookup via Open Food Facts API (free, no API key needed, wide coverage)
- When scanned, add to ingredient list as a structured item with per-serving macros already resolved — skips Edamam for this ingredient entirely
- Voice command: "I'm adding a scoop" after a scan — uses the scanned item's serving size

**Acceptance criteria:**
- [ ] Camera scans UPC/EAN barcodes reliably
- [ ] Open Food Facts lookup returns macros for 80%+ of common US grocery items
- [ ] Scanned ingredients appear in the cooking session alongside voice-entered ingredients
- [ ] Fallback flow when item is not in OFF: prompt user to enter macros manually once, cache for future

---

## 11. Shareable recipe pages

**Labels:** `feature`, `priority:medium`, `growth`, `backend`
**Effort:** 1 day (~8 hours)
**Depends on:** #6 (recipes need to be structured enough to render publicly)

**Why:** Each finalized recipe gets a public URL. Cooking becomes slightly social (light retention hook) and every shared link is an organic growth vector. Simple to build, high optionality payoff.

**What to build:**
- `recipes.is_public` boolean, toggled by user from recipe detail screen
- Public-facing Next.js or simple static page at `https://sous.ai/r/<recipe_id>` (separate small deployment, not in the mobile app)
- Open Graph tags so link previews look good in iMessage, Twitter, Reddit
- "Cook this with Sous" CTA on the public page, links to App Store

**Acceptance criteria:**
- [ ] Public recipe page renders with ingredients, macros, notes
- [ ] OG image auto-generated from recipe data (can be a simple template, not a hero image)
- [ ] Privacy: private recipes never render publicly, even if someone guesses the URL
- [ ] CTA drives App Store link with attribution query param so we can measure share-driven installs

---

## 12. Apple Health integration

**Labels:** `feature`, `priority:medium`, `mobile`
**Effort:** 1 afternoon (~4 hours)
**Depends on:** #4

**Why:** Serious fitness users already track via Apple Health. Writing our macros there is a trust signal that we're integrating into their existing workflow, not trying to replace it. Low effort, high perceived value for the audience we care about.

**What to build:**
- `react-native-health` integration
- Permission flow on first finalize after update
- Write calories, protein, fat, carbs to HealthKit dietary category on every `/finalize`
- Settings toggle to disable

**Acceptance criteria:**
- [ ] Permission flow works, respects user denial
- [ ] Macros appear in Apple Health Nutrition tab after cooking
- [ ] Values are attributed to Sous Chef as the source app

---

## 13. Photo-based pantry / meal suggestion

**Labels:** `feature`, `priority:low`, `full-stack`
**Effort:** 1 weekend (~12 hours)
**Depends on:** #6

**Why:** Snap a photo of your fridge, get recipe suggestions based on what's there. This is the demo feature that would have landed the hackathon outcome differently — genuinely impressive-looking multimodal AI use. Low priority for users, high priority for pitch/portfolio visibility.

**What to build:**
- Camera capture + a multimodal vision call to identify visible ingredients. Groq does not offer vision models today, so this issue adds a second LLM dependency. Candidates: `gemini-2.5-flash` (cheapest), `openai/gpt-4o-mini`, `anthropic/claude-haiku-4.5`. Evaluate on 20 fridge photos before committing.
- Recipe suggestion: given identified ingredients + user's daily macro gap (#4) + recipe history, suggest 3 recipes
- One-tap: "Cook this" kicks off guided recipe mode (#6)

**Acceptance criteria:**
- [ ] Photo capture flow works reliably
- [ ] Vision model correctly identifies 80%+ of common fridge contents on a 20-photo test set
- [ ] Suggestions are contextual to user's goals and history, not generic
- [ ] New API key managed through the same secrets flow as the others (Railway env + `pydantic-settings`)

---

## 14. Revisit orchestration framework decision

**Labels:** `architecture`, `priority:low`, `research`
**Effort:** 1 day of evaluation, 1 weekend of migration if triggered
**Depends on:** #6 is complete and stable

**Why:** After #2, #4, and #6 are shipped, we'll have three handlers plus routing plus tool use. If the handler boilerplate has gotten repetitive, or if state transitions between modes are complex enough that explicit graph modeling would help, evaluate LangGraph (or Pydantic AI as a lighter alternative). If plain Python still reads clean, do nothing.

**What to build:**
- Write a one-page evaluation document: what specific pain are we feeling that a framework would solve? What's the migration cost? What do we give up?
- If migration is justified, do a spike on one handler to de-risk before committing
- Decision gate: either commit to migration, or commit to staying on plain Python for the foreseeable future and document why

**Acceptance criteria:**
- [ ] Written decision with rationale
- [ ] If migrating: spike complete and full migration plan exists
- [ ] If not migrating: explicit call-out in CLAUDE.md so future Claude instances don't re-litigate

**Notes for Claude Code:** This is a decision point, not an automatic upgrade. Plain Python handlers serve us well right now and the cost of a framework comes due every time we debug through an additional abstraction layer. The default answer is "no framework" unless the pain is specific and describable.

---

## Dependency graph (quick reference)

```
#1 eval harness ─┬─> #2 refactor handlers ─┬─> #3 confidence + Pro
                 │                          │
                 │                          ├─> #4 daily macros ──> #5 beta ──> #7 fixes ──> #7.5 auth ──> #8 App Store
                 │                          │                                                                │
                 │                          └─> #6 recipe mode ───────────────────────────────────────────> │
                 │                                                  │                                        │
                 │                                                  └─> #9 cookbook search                   │
                 │                                                  └─> #11 shareable                        │
                 │                                                  └─> #13 photo pantry                     │
                 │                                                                                           │
                 │                              #10 barcode (parallel) ────────────────────────────────────> │
                 │                              #12 Apple Health (after #4) ────────────────────────────────>│
                 │
                 └─> #14 framework revisit (after #6)
```

#7.5 gates #8 absolutely. Every other edge is a "should precede" not a hard block.

## Labels to create in the repo

If not already present:
- `priority:critical`, `priority:high`, `priority:medium`, `priority:low`
- `feature`, `refactor`, `bug`, `infra`, `testing`, `release`, `research`
- `backend`, `mobile`, `full-stack`
- `architecture`, `reliability`, `growth`, `qa`, `product`
