"""Mode classification.

The router decides which handler will run for a given utterance. The
classify() function is added in a follow-up commit; this commit only
introduces the Mode enum so handlers can reference it.
"""

from enum import StrEnum


class Mode(StrEnum):
    freestyle = "freestyle"
    qa = "qa"
    small_talk = "small_talk"
    recipe = "recipe"
