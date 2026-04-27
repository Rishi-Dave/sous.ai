"""Per-mode handlers and the Mode→handler dispatch dict.

The dispatch dict is consumed by client.process_utterance once the router
is wired in (next commit). Until then client.py calls freestyle.handle
directly to preserve current behaviour.
"""

from collections.abc import Awaitable, Callable

from ..router import Mode
from . import freestyle, qa, recipe, small_talk
from .base import HandlerInput

Handler = Callable[[HandlerInput], Awaitable[dict]]

HANDLERS: dict[Mode, Handler] = {
    Mode.freestyle: freestyle.handle,
    Mode.qa: qa.handle,
    Mode.small_talk: small_talk.handle,
    Mode.recipe: recipe.handle,
}

__all__ = ["HANDLERS", "Handler", "HandlerInput", "freestyle", "qa", "small_talk", "recipe"]
