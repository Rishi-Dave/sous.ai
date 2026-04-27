"""Deterministic post-processing for handler JSON output.

Applied after Groq returns to keep behaviour stable when the model ignores
prompt instructions (plural units, vague-qty table).
"""

_PLURAL_UNITS = {
    "cloves", "cups", "grams", "slices", "tsps", "tbsps",
    "ounces", "pounds", "liters", "milliliters", "pieces", "heads",
    "stalks", "leaves", "sprigs", "pinches", "dashes", "handfuls",
}

# Keyed on substrings of raw_phrase (lowercase). Applied after LLM response so
# tests are deterministic even when the model ignores the prompt table.
_VAGUE_QTY_MAP: list[tuple[str, float | None, str | None]] = [
    ("splash",  1.0,   "tsp"),
    ("pinch",   0.125, "tsp"),
    ("dash",    0.5,   "tsp"),
    ("drizzle", 1.0,   "tbsp"),
    ("handful", 0.5,   "cup"),
    ("to taste", None, None),
]


def _singularize_units(parsed: dict) -> None:
    for item in parsed.get("items") or []:
        unit = (item.get("unit") or "").strip().lower()
        if unit in _PLURAL_UNITS:
            item["unit"] = unit.rstrip("s")


def _normalize_vague_qty(parsed: dict) -> bool:
    """Returns True if any item had its qty resolved from null to a concrete value."""
    resolved_any = False
    for item in parsed.get("items") or []:
        phrase = (item.get("raw_phrase") or "").lower()
        was_null = item.get("qty") is None
        for keyword, qty, unit in _VAGUE_QTY_MAP:
            if keyword in phrase:
                item["qty"] = qty
                item["unit"] = unit
                if was_null and qty is not None:
                    resolved_any = True
                break
    return resolved_any


def apply(parsed: dict) -> None:
    """Singularize units, normalize vague qty, and rewrite vague-qty clarification
    questions so TTS doesn't speak an unanswerable question."""
    _singularize_units(parsed)
    resolved_vague = _normalize_vague_qty(parsed)
    if resolved_vague and parsed.get("ack", "").rstrip().endswith("?"):
        items = parsed.get("items") or []
        phrase = items[0]["raw_phrase"] if items else "that"
        parsed["ack"] = f"Got it, adding {phrase}."
