"""
Schema linter for utterances.yaml + baseline_scores.json.

Runs as a fast, offline check suitable for CI — no Groq calls. Catches:
- malformed YAML
- duplicate or missing ids
- expected_intent values outside the Intent enum
- case count below the committed floor (150)
- baseline_scores.json missing or malformed

Usage:
    uv run python -m gemini_client.evals._lint
    # or
    uv run python backend/gemini_client/evals/_lint.py

Exits non-zero on any violation.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

from gemini_client import Intent
from gemini_client.router import Mode

EVALS_DIR = Path(__file__).parent
UTTERANCES_PATH = EVALS_DIR / "utterances.yaml"
BASELINE_PATH = EVALS_DIR / "baseline_scores.json"

CASE_FLOOR = 150
VALID_INTENTS = {i.value for i in Intent}
VALID_MODES = {m.value for m in Mode}


def _lint_utterances() -> list[str]:
    errors: list[str] = []
    if not UTTERANCES_PATH.exists():
        return [f"missing: {UTTERANCES_PATH}"]

    try:
        with UTTERANCES_PATH.open() as f:
            cases = yaml.safe_load(f)
    except yaml.YAMLError as e:
        return [f"yaml parse error: {e}"]

    if not isinstance(cases, list):
        return ["utterances.yaml must be a YAML list at the top level"]

    if len(cases) < CASE_FLOOR:
        errors.append(f"case count {len(cases)} < floor {CASE_FLOOR}")

    seen_ids: set[str] = set()
    for i, case in enumerate(cases):
        if not isinstance(case, dict):
            errors.append(f"row {i}: not a mapping")
            continue

        cid = case.get("id")
        if not cid:
            errors.append(f"row {i}: missing id")
        elif cid in seen_ids:
            errors.append(f"duplicate id: {cid}")
        else:
            seen_ids.add(cid)

        utt = case.get("utterance_text")
        if not utt or not isinstance(utt, str):
            errors.append(f"[{cid or i}] missing/invalid utterance_text")

        intent = case.get("expected_intent")
        if intent not in VALID_INTENTS:
            errors.append(
                f"[{cid or i}] expected_intent={intent!r} not in {sorted(VALID_INTENTS)}"
            )

        exp_ing = case.get("expected_ingredient")
        if exp_ing is not None:
            if not isinstance(exp_ing, dict) or "name" not in exp_ing:
                errors.append(f"[{cid or i}] expected_ingredient must have a 'name'")

        exp_mode = case.get("expected_mode")
        if exp_mode is not None and exp_mode not in VALID_MODES:
            errors.append(
                f"[{cid or i}] expected_mode={exp_mode!r} not in {sorted(VALID_MODES)}"
            )

    return errors


def _lint_baseline() -> list[str]:
    errors: list[str] = []
    if not BASELINE_PATH.exists():
        # Baseline is allowed to be absent before the first measured run.
        # Print a notice but don't fail — CI on the first PR will have no baseline.
        print(f"notice: {BASELINE_PATH.name} not present yet (ok for first run)")
        return errors

    try:
        with BASELINE_PATH.open() as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return [f"baseline parse error: {e}"]

    if not isinstance(data, dict):
        return ["baseline must be a JSON object"]

    for required in ("overall", "per_intent"):
        if required not in data:
            errors.append(f"baseline missing key: {required}")

    pi = data.get("per_intent", {})
    if isinstance(pi, dict):
        for intent in pi:
            if intent not in VALID_INTENTS:
                errors.append(f"baseline per_intent has unknown intent: {intent}")

    return errors


def main() -> int:
    errors = _lint_utterances() + _lint_baseline()
    if errors:
        print("eval lint FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print("eval lint OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
