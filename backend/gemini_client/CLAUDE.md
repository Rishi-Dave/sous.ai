# backend/gemini_client/ — Gemini client

Classification, ingredient extraction, clarification, and Q&A for `/utterance`. Either dev may edit this module per the partner-workflow feedback memory — branch prefix identifies the driver, not ownership. Breaking contract changes still require coordination.

> Naming note: the module is named `gemini_client` for historical reasons. The current implementation calls Groq (`llama-3.1-8b-instant` for chat, `whisper-large-v3-turbo` for transcription). A rename is out of scope for now.

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

## Module structure

```
gemini_client/
├── client.py        process_utterance — orchestration only (transcribe → route → dispatch → postprocess → validate)
├── router.py        Mode enum + hybrid classify(): heuristic fast-paths, then LLM fallback
├── context.py       assemble_context(session_ingredients, pending_clarification)
├── postprocess.py   apply(): singularize units, normalize vague qty, rewrite vague-qty clarification questions
├── _groq.py         Private IO layer: client singleton, Whisper transcription, agentic chat+tool-call loop, JSON extraction
├── handlers/
│   ├── freestyle.py    add_ingredient + finish_recipe (the bulk of utterances)
│   ├── qa.py           question (substitution / technique / timing / doneness)
│   ├── small_talk.py   acknowledgment + small_talk
│   └── recipe.py       STUB — reserved for #25
├── prompts/
│   ├── router.txt       4-way classification, ≤20 lines
│   ├── freestyle.txt    extraction + finish detection
│   ├── qa.txt           cooking advice
│   └── small_talk.txt   short friendly reply
├── nutrition_tool.py   Edamam wrapper (used by freestyle handler only)
├── schemas.py          Pydantic types: Intent, ParsedIngredient, UtteranceResponse
├── tests/test_utterances.py   semantic assertion harness
└── evals/              YAML-driven eval suite (160 end-to-end cases + 154 router-only cases). Baseline-gated.
```

The router decides which handler runs. Handlers each have a focused prompt and emit a narrower JSON shape — the orchestration layer in `client.py` validates against `UtteranceResponse` (Pydantic fills absent optional fields).

## Dev loop

```bash
cd backend
uv run pytest gemini_client/tests/test_utterances.py -v   # semantic harness
uv run pytest gemini_client/evals/test_router.py -q       # router-only eval (~9 min live)
uv run pytest gemini_client/evals/test_eval.py -q         # end-to-end classification eval (~30-40 min live)
uv run pytest gemini_client/evals/ -q                     # both
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

Lives in `postprocess.py` and is also reflected in `prompts/freestyle.txt`. Both must agree.

## Regression targets on file

When you iterate on the prompt, these are the historical failure modes baselined into `evals/baseline_scores.json`. The router + per-handler split (PR #36) lifted all three on a measured run; the baseline is intentionally **not** bumped in that PR — the improvements stay visible as headroom and the bump can be made after a stable run or two.

- Past-tense narration (_"added oil"_, _"throwing in some garlic"_) misclassified as `acknowledgment` / `small_talk` instead of `add_ingredient`. Eval category: `add_ingredient_past_tense`, baseline 0.75. Now scoring 1.0 on the focused freestyle prompt.
- `add_ingredient` with `qty=null` (_"I want milk"_) returned a generic confirmation instead of the prescribed _"How much milk would you like to add?"_ question. Eval category: `add_ingredient_no_qty`, baseline 0.80. Now scoring 1.0.
- `q_sub_heavy_cream` triggered a JSON-extra-data Pydantic validation error — the route has a soft-fall workaround; the root cause is in the Groq output format. Out of scope for the router refactor.

## Cross-cutting PR discipline

When a diff crosses module boundaries (touching both `backend/app/` and `gemini_client/`), capture the context in `docs/notes/<YYYY-MM-DD>-gemini-client-<slug>.md` and link it from the PR description so whoever isn't driving has the context without re-reading the whole diff.
