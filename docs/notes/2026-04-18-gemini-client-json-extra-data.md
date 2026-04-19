# gemini_client — JSONDecodeError: Extra data on live Groq output

**Date:** 2026-04-18
**Owner:** Atharva (`backend/gemini_client/`)
**Filed by:** Rishi (from `rh/elevenlabs-tts` integration)
**Severity:** Blocker for mobile E2E (any real mic input hits this)

## Symptom

`POST /utterance` with a real audio file (non-silence) 500s with:

```
File ".../backend/gemini_client/client.py", line 149, in process_utterance
    return UtteranceResponse.model_validate(json.loads(raw))
                                            ^^^^^^^^^^^^^^^
File ".../json/decoder.py", line 341, in decode
    raise JSONDecodeError("Extra data", s, end)
json.decoder.JSONDecodeError: Extra data: line 1 column 112 (char 111)
```

## Root cause hypothesis

Groq's `llama-3.1-8b-instant` is emitting content after the intended JSON object —
likely a second object, a prose explanation, or a trailing `</s>` token. `json.loads`
rejects anything beyond a single top-level value, so the whole call fails even
though the first 111 characters probably are a valid `UtteranceResponse`.

## Suggested fix (non-exhaustive)

One of:

1. **Stricter prompt** — re-emphasise "return ONLY the JSON object, no prose, no code fences". Cheapest.
2. **Greedy-object parse** — use `json.JSONDecoder.raw_decode(raw)` instead of
   `json.loads(raw)`; it returns `(obj, end_index)` and ignores trailing junk. One line.
3. **Structured output mode** — if Groq supports `response_format={"type": "json_object"}`
   for llama-3.1-8b-instant, turn it on. Most robust.

Option 2 is the smallest-diff unblock and would also handle the case where the
model later appends a `</s>` or newline.

## Cross-branch workaround (Rishi side)

`backend/app/routes/utterance.py` (this PR, `rh/elevenlabs-tts`) now catches any
exception from `gemini(...)`, logs a WARNING, and soft-falls to
`intent=small_talk, ack="Okay."` so the voice loop demos end-to-end while the
gemini_client bug is live. See the `TODO(ad/gemini-fix)` comment — remove both
the try/except AND its test once this note's fix lands.

## How to reproduce

```bash
cd backend && uv run uvicorn app.main:app --reload
# POST /utterance at /docs with any real-speech m4a/wav (silence won't repro —
# on silence Groq returns "" and the empty-ack fallback masks this bug)
```

## Files of interest

- `backend/gemini_client/client.py:149` — the `json.loads(raw)` call
- `backend/app/routes/utterance.py` — current soft-fall workaround
- `backend/tests/unit/test_utterance.py::test_utterance_gemini_raises_soft_falls_to_okay`
  — test that locks in the workaround behavior until the note is resolved
