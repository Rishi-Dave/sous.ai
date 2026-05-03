"""Suggest confidence thresholds from a recorded eval run.

Reads eval_results.json (written by conftest.pytest_sessionfinish) and
sweeps candidate thresholds per source (router_llm, freestyle_llm,
qa_llm, small_talk_llm). For each threshold T, it reports:

- precision (when confidence >= T, what % were correct)
- recall (what % of correct cases were above T — if we threshold out
  cases below T, this is the fraction of correct cases we still answer)
- mistakes-caught (what % of failures were below T — would-be-routed to
  disambiguation)
- unnecessary-asks (what % of correct cases were below T — user friction)

Recommends two thresholds per source: F1-maximizing, and the highest
threshold that keeps recall ≥ 0.95 (precision-favoring while not
nuking recall).

Usage:
    uv run python -m gemini_client.evals.suggest_thresholds
    uv run python -m gemini_client.evals.suggest_thresholds --input path/to/eval_results.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

DEFAULT_INPUT = Path(__file__).parent / "eval_results.json"

# Sweep thresholds 0.50 to 1.00 step 0.05.
_CANDIDATES: list[float] = [round(0.5 + 0.05 * i, 2) for i in range(11)]


def _bucket_metrics(rows: list[dict], threshold: float) -> dict:
    """All counts are inclusive of the threshold on the answered side
    (confidence >= T → answered)."""
    rated = [r for r in rows if r.get("confidence") is not None]
    if not rated:
        return {}

    answered = [r for r in rated if r["confidence"] >= threshold]
    asked = [r for r in rated if r["confidence"] < threshold]
    correct = [r for r in rated if r["passed"]]
    wrong = [r for r in rated if not r["passed"]]

    answered_correct = sum(1 for r in answered if r["passed"])
    answered_wrong = sum(1 for r in answered if not r["passed"])
    asked_correct = sum(1 for r in asked if r["passed"])
    asked_wrong = sum(1 for r in asked if not r["passed"])

    precision = answered_correct / len(answered) if answered else 1.0
    recall = answered_correct / len(correct) if correct else 1.0
    mistakes_caught = asked_wrong / len(wrong) if wrong else 0.0
    unnecessary_asks = asked_correct / len(correct) if correct else 0.0
    f1 = (
        (2 * precision * recall) / (precision + recall)
        if (precision + recall)
        else 0.0
    )

    return {
        "threshold": threshold,
        "n_rated": len(rated),
        "answered": len(answered),
        "asked": len(asked),
        "answered_correct": answered_correct,
        "answered_wrong": answered_wrong,
        "asked_correct": asked_correct,
        "asked_wrong": asked_wrong,
        "precision": precision,
        "recall": recall,
        "mistakes_caught": mistakes_caught,
        "unnecessary_asks": unnecessary_asks,
        "f1": f1,
    }


def _best_thresholds(rows: list[dict]) -> tuple[dict | None, dict | None]:
    """Returns (f1_max, recall_floor): row dicts for the F1-maximizing
    threshold and the highest threshold that keeps recall >= 0.95."""
    metrics = [m for m in (_bucket_metrics(rows, t) for t in _CANDIDATES) if m]
    if not metrics:
        return None, None
    f1_max = max(metrics, key=lambda m: (m["f1"], m["threshold"]))
    above_recall = [m for m in metrics if m["recall"] >= 0.95]
    recall_floor = max(above_recall, key=lambda m: m["threshold"]) if above_recall else None
    return f1_max, recall_floor


def _format_threshold_row(m: dict) -> str:
    return (
        f"  T={m['threshold']:.2f}  "
        f"P={m['precision']:.3f}  "
        f"R={m['recall']:.3f}  "
        f"F1={m['f1']:.3f}  "
        f"caught={m['mistakes_caught']:.2f}  "
        f"unnecessary={m['unnecessary_asks']:.2f}  "
        f"(answered {m['answered']}/{m['n_rated']}, "
        f"of which {m['answered_wrong']} wrong)"
    )


def _report_for_source(name: str, rows: list[dict]) -> None:
    rated = [r for r in rows if r.get("confidence") is not None]
    if not rated:
        print(f"\n[{name}] no rated cases — skipping")
        return

    correct = sum(1 for r in rated if r["passed"])
    wrong = len(rated) - correct
    print(f"\n[{name}] {len(rated)} rated cases ({correct} correct, {wrong} wrong)")

    if wrong == 0:
        print(f"  No wrong cases — threshold tuning is moot for {name}.")

    print("  Sweep:")
    for t in _CANDIDATES:
        m = _bucket_metrics(rated, t)
        if m:
            print(_format_threshold_row(m))

    f1_max, recall_floor = _best_thresholds(rated)
    print("\n  Recommendations:")
    if f1_max:
        print(
            f"    F1-max:        T={f1_max['threshold']:.2f}  "
            f"F1={f1_max['f1']:.3f}  P={f1_max['precision']:.3f}  R={f1_max['recall']:.3f}"
        )
    if recall_floor:
        print(
            f"    Recall ≥ 0.95: T={recall_floor['threshold']:.2f}  "
            f"P={recall_floor['precision']:.3f}  R={recall_floor['recall']:.3f}"
        )
    else:
        print("    Recall ≥ 0.95: no candidate threshold preserves recall")


def _group_by_source(rows: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        src = r.get("confidence_source") or "unknown"
        groups[src].append(r)
    return groups


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Path to eval_results.json (default: {DEFAULT_INPUT.name})",
    )
    args = p.parse_args(argv)

    if not args.input.exists():
        print(f"error: {args.input} not found — run the eval suite first", file=sys.stderr)
        return 1

    with args.input.open() as f:
        payload = json.load(f)

    print(f"Eval results: {args.input}")
    print(f"  measured_on:    {payload.get('measured_on', 'unknown')}")
    print(f"  model_snapshot: {payload.get('model_snapshot', 'unknown')}")

    eval_rows = payload.get("eval", [])
    router_rows = payload.get("router", [])

    print(f"\n# End-to-end eval ({len(eval_rows)} cases)")
    for src, rows in sorted(_group_by_source(eval_rows).items()):
        _report_for_source(src, rows)

    print(f"\n# Router-only eval ({len(router_rows)} cases)")
    for src, rows in sorted(_group_by_source(router_rows).items()):
        _report_for_source(f"router/{src}", rows)

    return 0


if __name__ == "__main__":
    sys.exit(main())
