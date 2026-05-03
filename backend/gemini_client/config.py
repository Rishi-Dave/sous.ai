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

LLM_BASE_URL: str | None = os.environ.get("LLM_BASE_URL") or None
LLM_API_KEY: str = os.environ.get("LLM_API_KEY") or os.environ.get("GROQ_API_KEY", "")
LLM_MODEL: str = os.environ.get("LLM_MODEL", "llama-3.1-8b-instant")

ROUTER_CONFIDENCE_THRESHOLD: float = float(
    os.environ.get("LLM_ROUTER_CONFIDENCE_THRESHOLD", "0.7")
)
FREESTYLE_CONFIDENCE_THRESHOLD: float = float(
    os.environ.get("LLM_FREESTYLE_CONFIDENCE_THRESHOLD", "0.75")
)
