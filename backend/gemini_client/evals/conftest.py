"""
Pytest plumbing for the gemini_client eval harness.

Owns:
- The 1.5s rate-limit buffer between live Groq calls (matches tests/test_utterances.py).
- The `scorecard` session-scoped fixture that collects per-case pass/fail.
- The pytest_sessionfinish hook that prints the scorecard table and gates on
  baseline_scores.json. Any per-intent or per-category accuracy below the
  committed baseline (minus tolerance) flips the session exit status to 1.
"""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pytest

from gemini_client.router import Mode

EVALS_DIR = Path(__file__).parent
UTTERANCES_PATH = EVALS_DIR / "utterances.yaml"
BASELINE_PATH = EVALS_DIR / "baseline_scores.json"


# Default Mode per eval category. The router test uses this as the expected
# mode unless the case sets `expected_mode` explicitly. Categories absent here
# (e.g. `ambiguous`) are skipped from the router eval unless they declare
# `expected_mode` per-case.
_CATEGORY_TO_MODE: dict[str, Mode] = {
    "add_ingredient_imperative": Mode.freestyle,
    "add_ingredient_past_tense": Mode.freestyle,
    "add_ingredient_vague_qty": Mode.freestyle,
    "add_ingredient_no_qty": Mode.freestyle,
    "add_ingredient_multi": Mode.freestyle,
    "clarification_reply": Mode.freestyle,
    "finish_recipe": Mode.freestyle,
    "question_substitution": Mode.qa,
    "question_technique": Mode.qa,
    "question_timing": Mode.qa,
    "small_talk": Mode.small_talk,
    "acknowledgment_multi_word": Mode.small_talk,
    "acknowledgment_single_word": Mode.small_talk,
}


def expected_mode_for(case: dict) -> Mode | None:
    explicit = case.get("expected_mode")
    if explicit:
        return Mode(explicit)
    return _CATEGORY_TO_MODE.get(case.get("category", ""))


@pytest.fixture(autouse=True)
async def rate_limit_buffer():
    """Sleep 1.5s after each test. Groq free tier throttles aggressively;
    this mirrors the sleep in backend/gemini_client/tests/test_utterances.py."""
    yield
    await asyncio.sleep(1.5)


@dataclass
class CaseResult:
    case_id: str
    intent: str
    category: str
    passed: bool
    diff: str


class Scorecard:
    def __init__(self) -> None:
        self.results: list[CaseResult] = []

    def record(self, case: dict, passed: bool, diff: str) -> None:
        self.results.append(
            CaseResult(
                case_id=case["id"],
                intent=case["expected_intent"],
                category=case.get("category", case["expected_intent"]),
                passed=passed,
                diff=diff,
            )
        )

    def overall(self) -> tuple[int, int]:
        return sum(r.passed for r in self.results), len(self.results)

    def by_intent(self) -> dict[str, tuple[int, int]]:
        buckets: dict[str, list[bool]] = {}
        for r in self.results:
            buckets.setdefault(r.intent, []).append(r.passed)
        return {k: (sum(v), len(v)) for k, v in buckets.items()}

    def by_category(self) -> dict[str, tuple[int, int]]:
        buckets: dict[str, list[bool]] = {}
        for r in self.results:
            buckets.setdefault(r.category, []).append(r.passed)
        return {k: (sum(v), len(v)) for k, v in buckets.items()}

    def failures(self) -> list[CaseResult]:
        return [r for r in self.results if not r.passed]


# Module-level singleton so pytest_sessionfinish can reach it without
# going through the fixture machinery.
_SCORECARD = Scorecard()

# Router eval results — keyed on expected mode, list of pass bools per case.
_ROUTER_RESULTS: dict[str, list[bool]] = defaultdict(list)


@pytest.fixture(scope="session")
def scorecard() -> Scorecard:
    return _SCORECARD


def record_router_result(expected_mode: str, passed: bool) -> None:
    _ROUTER_RESULTS[expected_mode].append(passed)


def _load_baseline() -> dict:
    if not BASELINE_PATH.exists():
        return {}
    with BASELINE_PATH.open() as f:
        return json.load(f)


def _fmt_line(label: str, passed: int, total: int, baseline: float | None, tol: float) -> str:
    pct = passed / total if total else 0.0
    base_str = ""
    if baseline is not None:
        delta = pct - baseline
        marker = "OK" if pct >= baseline - tol else f"REGRESSION {delta:+.3f}"
        base_str = f"  (baseline {baseline:.3f}  {marker})"
    return f"  {label:<32} {passed:>4}/{total:<4} = {pct:.3f}{base_str}"


def pytest_sessionfinish(session, exitstatus):
    sc = _SCORECARD
    if not sc.results and not _ROUTER_RESULTS:
        return

    reporter = session.config.pluginmanager.getplugin("terminalreporter")
    if reporter is None:
        return

    baseline = _load_baseline()
    tol = baseline.get("tolerance", 0.0) if baseline else 0.0

    if _ROUTER_RESULTS:
        _report_router_scorecard(reporter, baseline, tol, session)
        if not sc.results:
            return

    reporter.write_sep("=", "Gemini eval scorecard")

    # Overall
    passed, total = sc.overall()
    overall_baseline = baseline.get("overall") if baseline else None
    reporter.write_line(_fmt_line("OVERALL", passed, total, overall_baseline, tol))

    # Per intent
    reporter.write_line("")
    reporter.write_line("Per intent:")
    per_intent_baseline = baseline.get("per_intent", {}) if baseline else {}
    for intent, (p, t) in sorted(sc.by_intent().items()):
        reporter.write_line(_fmt_line(intent, p, t, per_intent_baseline.get(intent), tol))

    # Per category
    reporter.write_line("")
    reporter.write_line("Per category:")
    per_cat_baseline = baseline.get("per_category", {}) if baseline else {}
    for cat, (p, t) in sorted(sc.by_category().items()):
        reporter.write_line(_fmt_line(cat, p, t, per_cat_baseline.get(cat), tol))

    # Failures
    fails = sc.failures()
    if fails:
        reporter.write_line("")
        reporter.write_line(f"Failures ({len(fails)}):")
        for r in fails:
            reporter.write_line(f"  [{r.case_id}] {r.diff}")

    # Regression gate
    #
    # Model: an eval run is a measurement. Individual case drift (e.g. the model
    # returning "cloves" one run and "clove" the next) should not fail CI; only
    # an aggregate drop below the committed baseline should. So when a baseline
    # is present, the regression check is authoritative over pytest's default
    # "any failure fails the session" behavior.
    if baseline:
        regressed = _detect_regression(sc, baseline, tol)
        if regressed:
            reporter.write_line("")
            reporter.write_line("BASELINE REGRESSION — failing session.")
            session.exitstatus = 1
        else:
            if session.exitstatus != 0:
                reporter.write_line("")
                reporter.write_line(
                    "Individual cases failed but baseline met — session passes."
                )
                session.exitstatus = 0
    else:
        proposed = _build_proposed_baseline(sc)
        proposed_path = EVALS_DIR / "baseline_scores.proposed.json"
        with proposed_path.open("w") as f:
            json.dump(proposed, f, indent=2)
            f.write("\n")
        reporter.write_line("")
        reporter.write_line(
            f"No baseline_scores.json yet — wrote measured scores to "
            f"{proposed_path.name}. Review, adjust the 'notes' field, "
            f"then rename to baseline_scores.json and commit."
        )


def _report_router_scorecard(reporter, baseline: dict, tol: float, session) -> None:
    reporter.write_sep("=", "Router scorecard")
    per_mode_baseline = baseline.get("per_mode", {}) if baseline else {}

    overall_passed = sum(sum(rs) for rs in _ROUTER_RESULTS.values())
    overall_total = sum(len(rs) for rs in _ROUTER_RESULTS.values())
    reporter.write_line(
        _fmt_line("OVERALL", overall_passed, overall_total, per_mode_baseline.get("overall"), tol)
    )
    reporter.write_line("")
    reporter.write_line("Per mode:")
    for mode, results in sorted(_ROUTER_RESULTS.items()):
        p = sum(results)
        t = len(results)
        reporter.write_line(_fmt_line(mode, p, t, per_mode_baseline.get(mode), tol))

    if baseline and "per_mode" in baseline:
        regressed = False
        for mode, threshold in baseline["per_mode"].items():
            if mode == "overall":
                continue
            results = _ROUTER_RESULTS.get(mode)
            if not results:
                continue
            if sum(results) / len(results) < threshold - tol:
                regressed = True
        if "overall" in baseline["per_mode"] and overall_total:
            if overall_passed / overall_total < baseline["per_mode"]["overall"] - tol:
                regressed = True
        if regressed:
            reporter.write_line("")
            reporter.write_line("ROUTER BASELINE REGRESSION — failing session.")
            session.exitstatus = 1


def _build_proposed_baseline(sc: Scorecard) -> dict:
    """Build a baseline_scores.json payload from measured results. The operator
    reviews this file, adjusts notes, then renames it to the canonical name."""
    def _pct(bucket: tuple[int, int]) -> float:
        p, t = bucket
        return round(p / t, 3) if t else 0.0

    overall = sc.overall()
    return {
        "overall": _pct(overall),
        "per_intent": {k: _pct(v) for k, v in sc.by_intent().items()},
        "per_category": {k: _pct(v) for k, v in sc.by_category().items()},
        "tolerance": 0.0,
        "measured_on": date.today().isoformat(),
        "model_snapshot": "llama-3.1-8b-instant (Groq)",
        "notes": (
            "Measured baseline captured by the eval runner. Review per_category "
            "rows before committing — low scores lock in broken behavior, so any "
            "improvement becomes visible. Update only with PR justification."
        ),
    }


def _detect_regression(sc: Scorecard, baseline: dict, tol: float) -> bool:
    if not baseline:
        return False

    regressed = False
    if "overall" in baseline:
        p, t = sc.overall()
        if t and p / t < baseline["overall"] - tol:
            regressed = True

    for intent, threshold in baseline.get("per_intent", {}).items():
        bucket = sc.by_intent().get(intent)
        if bucket is None:
            continue
        p, t = bucket
        if t and p / t < threshold - tol:
            regressed = True

    for cat, threshold in baseline.get("per_category", {}).items():
        bucket = sc.by_category().get(cat)
        if bucket is None:
            continue
        p, t = bucket
        if t and p / t < threshold - tol:
            regressed = True

    return regressed
