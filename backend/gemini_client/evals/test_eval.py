"""
YAML-driven eval runner. One parametrized test per row in utterances.yaml.

Each case calls the live `process_utterance` and checks intent + optional
ingredient fields. A per-case pass/fail is recorded on the session Scorecard;
the scorecard is printed (and the baseline gate applied) in conftest's
pytest_sessionfinish hook.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from gemini_client import ParsedIngredient, process_utterance

from .conftest import UTTERANCES_PATH


def _load_cases() -> list[dict]:
    if not UTTERANCES_PATH.exists():
        return []
    with UTTERANCES_PATH.open() as f:
        data = yaml.safe_load(f) or []
    return data


def _parse_session_ingredients(raw: list[dict] | None) -> list[ParsedIngredient]:
    if not raw:
        return []
    out: list[ParsedIngredient] = []
    for ing in raw:
        fields = dict(ing)
        if "raw_phrase" not in fields:
            qty = fields.get("qty")
            unit = fields.get("unit") or ""
            name = fields["name"]
            fields["raw_phrase"] = (
                f"{qty} {unit} {name}".strip() if qty is not None else name
            )
        out.append(ParsedIngredient(**fields))
    return out


def _normalize_unit(unit: str | None) -> str:
    """Strip trailing 's' so 'cloves' matches 'clove'. The live model often
    drifts between singular/plural; we treat that as not-a-regression."""
    if not unit:
        return ""
    return unit.lower().rstrip("s")


def _compare(case: dict, result) -> tuple[bool, str]:
    expected_intent = case["expected_intent"]
    actual_intent = result.intent.value if hasattr(result.intent, "value") else str(result.intent)

    if actual_intent != expected_intent:
        return False, (
            f"intent: expected={expected_intent} got={actual_intent} "
            f"(ack={result.ack!r})"
        )

    expected_ing = case.get("expected_ingredient")
    if expected_ing:
        if not result.items:
            return False, f"items empty; expected ingredient={expected_ing}"
        item = result.items[0]
        name = expected_ing.get("name", "")
        if name and name.lower() not in item.name.lower():
            return False, (
                f"ingredient.name: expected~={name!r} got={item.name!r}"
            )
        exp_qty = expected_ing.get("qty")
        if "qty" in expected_ing and exp_qty is not None:
            if item.qty != exp_qty:
                return False, (
                    f"ingredient.qty: expected={exp_qty} got={item.qty}"
                )
        if "qty" in expected_ing and exp_qty is None:
            if item.qty is not None:
                return False, (
                    f"ingredient.qty: expected=None got={item.qty}"
                )
        exp_unit = expected_ing.get("unit")
        if exp_unit is not None:
            if _normalize_unit(item.unit) != _normalize_unit(exp_unit):
                return False, (
                    f"ingredient.unit: expected={exp_unit!r} got={item.unit!r}"
                )

    return True, ""


CASES = _load_cases()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case",
    CASES,
    ids=[c["id"] for c in CASES] if CASES else [],
)
async def test_case(case, scorecard):
    try:
        result = await process_utterance(
            audio_bytes=case["utterance_text"].encode("utf-8"),
            session_ingredients=_parse_session_ingredients(case.get("session_ingredients")),
            pending_clarification=case.get("pending_clarification"),
        )
    except Exception as e:
        # Client raised (ValidationError, JSONDecodeError, transport, etc.).
        # Record as a scored failure so the scorecard denominator stays
        # honest — these failures matter just as much as misclassifications.
        diff = f"client_error: {type(e).__name__}: {str(e)[:160]}"
        scorecard.record(case, False, diff)
        pytest.fail(f"[{case['id']}] {diff}")

    passed, diff = _compare(case, result)
    scorecard.record(case, passed, diff)
    assert passed, f"[{case['id']}] {diff}"
