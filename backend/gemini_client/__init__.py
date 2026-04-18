"""Public interface for the Gemini-backed utterance processor.

Owned by Atharva. Rishi imports from here; do not edit this module
from the integration side. See CLAUDE.md in this directory.
"""

from .schemas import Intent, ParsedIngredient, UtteranceResponse
from .client import process_utterance

__all__ = [
    "Intent",
    "ParsedIngredient",
    "UtteranceResponse",
    "process_utterance",
]
