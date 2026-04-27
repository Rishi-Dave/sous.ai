"""Small-talk handler: acknowledgment + small_talk.

Emits a short friendly ack; never produces items or an answer.
"""

from pathlib import Path

from .._groq import chat_with_tools, extract_json
from .base import HandlerInput

_PROMPT = (Path(__file__).parent.parent / "prompts" / "small_talk.txt").read_text(encoding="utf-8")


async def handle(input: HandlerInput) -> dict:
    user_msg = f'User said: "{input.transcript}"'
    if input.context_str:
        user_msg = f"{input.context_str}\n\n{user_msg}"
    messages: list[dict] = [
        {"role": "system", "content": _PROMPT},
        {"role": "user", "content": user_msg},
    ]
    raw = await chat_with_tools(messages)
    return extract_json(raw)
