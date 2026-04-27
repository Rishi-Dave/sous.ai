# `gemini_client/evals/` — classification eval harness

A reproducible scorecard for `process_utterance`. Every change to the prompt,
the model, or the schema should run this suite before merge.

The suite is **complementary** to `gemini_client/tests/test_utterances.py`:
the tests there make semantic assertions (e.g. "ack contains a question when
qty=None") that don't fit a flat YAML. This harness is the intent/ingredient
scorecard, baseline-gated.

## Run

```bash
cd backend

# Full end-to-end suite (intent/ingredient scoring) — ~40 min wall.
uv run pytest gemini_client/evals/test_eval.py -v --tb=short

# Router-only eval (mode classification, no handlers) — ~9 min wall.
uv run pytest gemini_client/evals/test_router.py -q --tb=short

# Both:
uv run pytest gemini_client/evals/ -v --tb=short
```

`test_eval.py` runs ~40 minutes wall time (measured 0:38:56 on the
2026-04-22 baseline run): 160 cases × 1.5s rate-limit + model latency.
`test_router.py` runs ~9 minutes (154 cases — the 6 ambiguous-category
cases are unmoded by default).

Both call the live Groq API — `GROQ_API_KEY` must be set in your shell
or in the repo-root `.env` (the client calls `dotenv.find_dotenv()`,
which walks up the tree). Check with `echo $GROQ_API_KEY | head -c 8`
or `grep GROQ ../.env`.

At the end, the scorecard prints to the terminal. Example:

```
========= Gemini eval scorecard =========
  OVERALL                          132 /160  = 0.825  (baseline 0.820  OK)

Per intent:
  acknowledgment                    17 /18   = 0.944  (baseline 0.944  OK)
  add_ingredient                    68 /76   = 0.895  (baseline 0.880  OK)
  finish_recipe                     10 /10   = 1.000  (baseline 1.000  OK)
  question                          28 /30   = 0.933  (baseline 0.933  OK)
  small_talk                         9 /16   = 0.563  (baseline 0.700  REGRESSION -0.137)
  ...

Per category:
  add_ingredient_past_tense         10 /20   = 0.500  (baseline 0.500  OK)
  ...

BASELINE REGRESSION — failing session.
```

## Lint (offline, fast)

```bash
cd backend
uv run python -m gemini_client.evals._lint
```

Runs in milliseconds — verifies `utterances.yaml` parses, every `expected_intent`
is in the `Intent` enum, every case has a unique id, the case count is ≥150,
and `baseline_scores.json` is valid JSON. This is what CI runs on every PR;
see `.github/workflows/eval-lint.yml`.

## Adding a case when you hit a production bug

This is the primary payoff of the harness. When you observe a misclassification
in the wild — in Swagger, on device, or via a user report — capture the exact
utterance + session context and add a row here **before** you touch the prompt:

1. Reproduce the failure (manual Swagger call or `test_utterances.py` scratch).
2. Append to `utterances.yaml` with a descriptive `id`, a relevant `category`
   (reuse an existing one where possible), and `notes` citing the
   `docs/notes/*.md` bug report.
3. Rerun the suite. Your new case should fail — that is the "red" in
   red-green-refactor. Commit the case.
4. Fix the prompt / schema / classifier.
5. Rerun the suite. Your new case passes. If accuracy on any bucket
   *dropped* as a side effect, you'll see the regression in the scorecard —
   decide whether to accept the tradeoff or keep iterating.
6. If the fix materially improves a bucket, update `baseline_scores.json` in
   the same PR with a one-line explanation in the `notes` field.

## Updating the baseline

The baseline is committed and serves as the gate. Regressions fail the session;
improvements require an explicit bump.

**First run (no baseline):** the runner writes `baseline_scores.proposed.json`
containing the measured scores. Review it, adjust the `notes`, then rename to
`baseline_scores.json` and commit.

**After an intentional improvement:** recompute by running the suite, then
copy the measured values into `baseline_scores.json`. In the PR description,
explain which intents/categories moved and why. A baseline bump without
justification is a code-review red flag — the whole point of the baseline
is to make drift visible.

**Never lower the baseline to "make CI green."** If a legitimate regression
is blocking unrelated work, either fix the regression or roll back the change
that caused it. If it's a model-drift flake affecting a single case, raise
`tolerance` in the baseline file (with a note) rather than silently lowering
per-bucket scores.

## Schema

Each row is self-contained:

```yaml
- id: short_snake_case_slug        # unique; becomes the pytest test id
  category: add_ingredient_past_tense   # finer bucket than intent
  utterance_text: "added oil to the pan"
  expected_intent: add_ingredient       # one of the Intent enum values
  expected_ingredient:                  # optional; only for add_ingredient
    name: oil                            # case-insensitive substring match
    qty: 2.0                             # optional; exact float compare
    unit: tbsp                           # optional; compared with .rstrip('s')
  session_ingredients:                  # optional; prior ingredient list
    - name: pasta
      qty: 200.0
      unit: g
      raw_phrase: "200 grams of pasta"
  pending_clarification: "How much salt?" # optional; prior clarifying question
  expected_mode: freestyle              # optional; overrides the per-category
                                        # default in conftest._CATEGORY_TO_MODE.
                                        # Used by test_router.py only.
  notes: "cite docs/notes/*.md if this is a regression target"
```

### Router eval (`test_router.py`)

Tests `router.classify()` in isolation — no handler call, no Groq tool
loop, no transcription. Each case's expected mode comes from the YAML
`expected_mode` field if present, otherwise from the per-category default
in `conftest._CATEGORY_TO_MODE`. Cases with neither are skipped. Today
that is the 6 `ambiguous` cases.

The per-mode scorecard is gated against `baseline_scores.json#per_mode`
the same way as `per_intent` / `per_category`. `recipe` mode currently
has no eval cases — it is reserved for the recipe-following feature.

### Comparator rules

- **Intent:** strict equality against the enum value.
- **Ingredient name:** case-insensitive substring — `"oil"` matches
  `"olive oil"`, so prefer the *core noun* as the expected value to avoid
  brittle model-output churn.
- **Ingredient qty:** exact float. If you write `qty: null`, the model must
  return `None`; if you omit the key entirely, qty is don't-care.
- **Ingredient unit:** normalized via `rstrip('s')` so `"cloves"` and
  `"clove"` are equal. Omit the key if you don't care about the unit.
  The comparator does NOT normalize synonyms — `"gram"` and `"g"` are
  different strings. When you add a case, use the form the model
  actually returns (check by running the suite and reading the diff).
- **Multi-ingredient cases:** the comparator only inspects `result.items[0]`.
  If your utterance produces multiple items, assert on the first or split
  it into two cases. The multi-ingredient category measures whether the
  model correctly classifies these as `add_ingredient` (not whether every
  item is parsed perfectly) — that's by design, and fits the schema.

## Do NOT synthesize cases with an LLM

Cases must come from real testing (harvest + hand-write). Asking an LLM to
generate utterances for the eval measures whether the model agrees with
itself, not whether the system works. When in doubt, sit with your phone
and say something out loud; if it would feel natural mid-cook, capture it.

## File layout

```
evals/
├── README.md                  this file
├── __init__.py
├── utterances.yaml            labeled cases
├── baseline_scores.json       committed baseline (measured; update via PR)
├── baseline_scores.proposed.json  auto-written on first run for review
├── conftest.py                scorecard + baseline gate (pytest_sessionfinish)
├── test_eval.py               parametrized runner; one test per YAML row
├── test_router.py             router-isolation eval; one test per YAML row with a mode
└── _lint.py                   offline schema checker; runs in CI
```

## CI

`.github/workflows/eval-lint.yml` runs `_lint.py` on every PR touching
`backend/gemini_client/**`. It does not call Groq. The commented-out
`eval-live` job activates once `GROQ_API_KEY` is added as a repo secret —
expect ~10 min per PR when enabled.
