"""Private Groq IO layer.

Wraps the Groq SDK with: a process-wide client singleton, Whisper transcription,
the agentic chat-completions retry+tool-call loop, and JSON extraction.
"""

import asyncio
import json
import logging
from typing import Any

import httpx
from groq import AsyncGroq, RateLimitError

from . import config
from .nutrition_tool import dispatch_tool_call

log = logging.getLogger(__name__)

_client: AsyncGroq | None = None


class _OpenAIPathRewriteTransport(httpx.AsyncHTTPTransport):
    """Rewrites the Groq SDK's /openai/v1/... path to /v1/... so the same
    SDK can talk to a local OpenAI-compatible server (e.g. Ollama) without
    pulling in a second SDK. Only attached when LLM_BASE_URL points to a
    non-Groq host — Groq's own endpoint requires the /openai/v1/ prefix.
    """

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.startswith("/openai/v1/"):
            new_path = "/v1/" + request.url.path[len("/openai/v1/"):]
            request.url = request.url.copy_with(path=new_path)
        return await super().handle_async_request(request)


def get_client() -> AsyncGroq:
    global _client
    if _client is None:
        kwargs: dict[str, Any] = {"api_key": config.LLM_API_KEY}
        if config.LLM_BASE_URL:
            kwargs["base_url"] = config.LLM_BASE_URL
            # The path-rewrite transport only makes sense for non-Groq backends
            # (Groq itself requires /openai/v1/). Skip it if the user explicitly
            # set LLM_BASE_URL=https://api.groq.com — otherwise Groq would 404.
            if "api.groq.com" not in config.LLM_BASE_URL:
                kwargs["http_client"] = httpx.AsyncClient(transport=_OpenAIPathRewriteTransport())
        _client = AsyncGroq(**kwargs)
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
    model: str | None = None,
    temperature: float = 0.1,
    max_tool_iterations: int = 5,
) -> str:
    """Run the chat-completions agentic loop and return the final raw text.

    Handles RateLimitError with exponential backoff (4 attempts). Loops up to
    `max_tool_iterations` times when Groq emits tool_calls; appends tool
    results into `messages` and re-calls.
    """
    client = get_client()
    resolved_model = model or config.LLM_MODEL
    log.info("groq input | messages=%s", json.dumps(messages, ensure_ascii=False))

    for _ in range(max_tool_iterations):
        for attempt in range(4):
            try:
                kwargs: dict[str, Any] = {
                    "model": resolved_model,
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
