"""Freestyle handler: add_ingredient + finish_recipe.

Owns ingredient extraction (with action=add/replace, vague-qty handling, and
clarification-reply parsing) and the user-said-they're-done signal.
"""

from pathlib import Path

from .. import config
from .._groq import chat_with_tools, extract_json
from ..nutrition_tool import NUTRITION_TOOL
from .base import HandlerInput

_PROMPT = (Path(__file__).parent.parent / "prompts" / "freestyle.txt").read_text(encoding="utf-8")


async def handle(input: HandlerInput) -> dict:
    user_msg = f'User said: "{input.transcript}"'
    if input.context_str:
        user_msg = f"{input.context_str}\n\n{user_msg}"
    messages: list[dict] = [
        {"role": "system", "content": _PROMPT},
        {"role": "user", "content": user_msg},
    ]
    tools = None if config.LLM_TOOLS_DISABLED else [NUTRITION_TOOL]
    raw = await chat_with_tools(messages, tools=tools)
    parsed = extract_json(raw)
    parsed["source"] = "freestyle_llm"

    # Stamp the disambiguation kind so the route layer's encoder knows which
    # sentinel to write. The prompt only emits {best, second}; the handler
    # owns the kind label since it's a backend-internal concept.
    # Malformed dicts (missing best/second) are dropped — surfacing them
    # would 502 via the Pydantic validator and confuse the route layer's
    # soft-fall, hiding the prompt regression.
    disambig = parsed.get("disambiguation")
    if isinstance(disambig, dict) and "best" in disambig and "second" in disambig:
        disambig["kind"] = "extraction"
    else:
        parsed.pop("disambiguation", None)

    return parsed
