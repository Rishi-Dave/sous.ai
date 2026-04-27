"""Freestyle handler: add_ingredient + finish_recipe.

Owns ingredient extraction (with action=add/replace, vague-qty handling, and
clarification-reply parsing) and the user-said-they're-done signal.
"""

from .._groq import chat_with_tools, extract_json
from ..nutrition_tool import NUTRITION_TOOL
from ._legacy_prompt import SYSTEM_PROMPT
from .base import HandlerInput


async def handle(input: HandlerInput) -> dict:
    user_msg = f'User said: "{input.transcript}"'
    if input.context_str:
        user_msg = f"{input.context_str}\n\n{user_msg}"
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]
    raw = await chat_with_tools(messages, tools=[NUTRITION_TOOL])
    return extract_json(raw)
