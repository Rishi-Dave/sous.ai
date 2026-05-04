"""Module-local config for the gemini_client.

Owns LLM client config (base_url / api_key / model) and the per-handler
confidence thresholds. Defaults preserve the production setup (Groq
+ llama-3.1-8b-instant); env-var overrides exist so the eval harness
can target a local Ollama for fast iteration.

Kept package-local on purpose. Importing from `backend/app/` here would
break the rule that gemini_client is a self-contained pure function.
"""

from __future__ import annotations

import os

from dotenv import find_dotenv, load_dotenv

# Load .env BEFORE reading env vars, otherwise GROQ_API_KEY (and any other
# .env-only secrets) would be missed when this module is imported before
# client.py's own load_dotenv. The original _groq.py read os.environ at
# call time and didn't have this race; centralising config means we have to.
load_dotenv(find_dotenv())

LLM_BASE_URL: str | None = os.environ.get("LLM_BASE_URL") or None
LLM_API_KEY: str = os.environ.get("LLM_API_KEY") or os.environ.get("GROQ_API_KEY", "")
LLM_MODEL: str = os.environ.get("LLM_MODEL", "llama-3.1-8b-instant")

# Some local models (e.g. Ollama llama3:8b) reject `tools=[...]` with HTTP 400.
# Default off so production stays unchanged. Set LLM_TOOLS_DISABLED=1 when
# iterating against a non-tool-capable backend — the freestyle handler will
# skip the Edamam tool call. Eval scoring (intent + ingredient name) doesn't
# depend on the tool, only on the model's text extraction.
LLM_TOOLS_DISABLED: bool = os.environ.get("LLM_TOOLS_DISABLED", "").lower() in ("1", "true", "yes")

ROUTER_CONFIDENCE_THRESHOLD: float = float(
    os.environ.get("LLM_ROUTER_CONFIDENCE_THRESHOLD", "0.7")
)
FREESTYLE_CONFIDENCE_THRESHOLD: float = float(
    os.environ.get("LLM_FREESTYLE_CONFIDENCE_THRESHOLD", "0.75")
)
