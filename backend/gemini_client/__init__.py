"""Public interface for the utterance processor.

See CLAUDE.md in this directory for the contract, module structure, and
partner-workflow rules. Either dev may edit this module — the branch
prefix identifies who is driving, not who owns the code. Breaking
contract changes still require coordination.
"""

from .schemas import Intent, ParsedIngredient, UtteranceResponse
from .client import process_utterance

__all__ = [
    "Intent",
    "ParsedIngredient",
    "UtteranceResponse",
    "process_utterance",
]
