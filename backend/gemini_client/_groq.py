"""Private Groq IO layer.

Wraps the Groq SDK with: a process-wide client singleton, Whisper transcription,
the agentic chat-completions retry+tool-call loop, and JSON extraction.
"""

import asyncio
import json
import logging
import os
from typing import Any

from groq import AsyncGroq, RateLimitError

from .nutrition_tool import dispatch_tool_call

log = logging.getLogger(__name__)

_client: AsyncGroq | None = None


def get_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=os.environ["GROQ_API_KEY"])
    return _client


async def transcribe(audio_bytes: bytes) -> str:
    transcription = await get_client().audio.transcriptions.create(
        file=("audio.wav", audio_bytes, "audio/wav"),
        model="whisper-large-v3-turbo",
    )
    return transcription.text


async def chat_with_tools(
    messages: list[dict],
    *,
    tools: list[dict] | None = None,
    model: str = "llama-3.1-8b-instant",
    temperature: float = 0.1,
    max_tool_iterations: int = 5,
) -> str:
    """Run the chat-completions agentic loop and return the final raw text.

    Handles RateLimitError with exponential backoff (4 attempts). Loops up to
    `max_tool_iterations` times when Groq emits tool_calls; appends tool
    results into `messages` and re-calls.
    """
    client = get_client()
    log.info("groq input | messages=%s", json.dumps(messages, ensure_ascii=False))

    for _ in range(max_tool_iterations):
        for attempt in range(4):
            try:
                kwargs: dict[str, Any] = {
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                }
                if tools:
                    kwargs["tools"] = tools
                    kwargs["tool_choice"] = "auto"
                response = await client.chat.completions.create(**kwargs)
                break
            except RateLimitError:
                if attempt == 3:
                    raise
                await asyncio.sleep(2 ** attempt)

        choice = response.choices[0]

        if choice.finish_reason == "tool_calls":
            assistant_msg = choice.message.model_dump(exclude_unset=True)
            messages.append(assistant_msg)
            for tc in choice.message.tool_calls:
                log.info(
                    "nutrition tool call | fn=%s args=%s",
                    tc.function.name,
                    tc.function.arguments,
                )
                result = await dispatch_tool_call(tc.function.name, tc.function.arguments)
                log.info(
                    "nutrition tool result | fn=%s result=%s",
                    tc.function.name,
                    result,
                )
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })
            continue

        return choice.message.content

    raise RuntimeError("Tool-call loop exceeded max iterations")


def extract_json(raw: str) -> dict:
    """Extract a JSON object from raw model text. Handles markdown-wrapped output."""
    start = raw.index("{")
    end = raw.rindex("}") + 1
    return json.loads(raw[start:end])
