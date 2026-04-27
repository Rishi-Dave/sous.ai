"""Router-isolation eval.

One parametrized test per case in utterances.yaml that has an expected mode
(either set explicitly via `expected_mode` or inferred from `category` via
the _CATEGORY_TO_MODE map in conftest). Calls only `router.classify()` —
no handler call, no nutrition tool, no transcription. Faster than the
end-to-end test_eval.py, suitable for iterating on the router prompt.
"""

from __future__ import annotations

import pytest
import yaml

from gemini_client.router import classify

from .conftest import UTTERANCES_PATH, expected_mode_for, record_router_result


def _load_router_cases() -> list[dict]:
    if not UTTERANCES_PATH.exists():
        return []
    with UTTERANCES_PATH.open() as f:
        cases = yaml.safe_load(f) or []
    return [c for c in cases if expected_mode_for(c) is not None]


CASES = _load_router_cases()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case",
    CASES,
    ids=[c["id"] for c in CASES] if CASES else [],
)
async def test_router(case):
    expected = expected_mode_for(case)
    actual = await classify(
        transcript=case["utterance_text"],
        session_ingredients=[],
        pending_clarification=case.get("pending_clarification"),
    )
    passed = actual == expected
    record_router_result(expected.value, passed)
    assert passed, (
        f"[{case['id']}] expected_mode={expected.value} got={actual.value}"
    )
