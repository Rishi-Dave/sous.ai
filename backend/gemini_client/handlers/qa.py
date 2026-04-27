"""Q&A handler: cooking questions (substitution, technique, timing).

Emits intent=question with a 1-2 sentence answer + a short ack preview.
"""

from .._groq import chat_with_tools, extract_json
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
    raw = await chat_with_tools(messages)
    return extract_json(raw)
