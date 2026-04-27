"""Build the context string prepended to the user message in handler calls."""

from .schemas import ParsedIngredient


def assemble_context(
    session_ingredients: list[ParsedIngredient],
    pending_clarification: str | None,
) -> str:
    lines = []
    if session_ingredients:
        parts = []
        for i in session_ingredients:
            parts.append(f"{i.qty} {i.unit} {i.name}".strip() if i.qty else i.name)
        lines.append(f"Ingredients added so far: {', '.join(parts)}")
    if pending_clarification:
        lines.append(f'You previously asked the user: "{pending_clarification}" — their reply follows.')
    return "\n".join(lines)
