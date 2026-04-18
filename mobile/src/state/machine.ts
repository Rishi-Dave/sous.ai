// State machine for the voice loop. Pure reducer, web-testable.
// Transition rules encode design doc §4 and root CLAUDE.md architecture rule 1
// (single audio consumer; 300ms re-arm buffer is handled in the UI layer, not here).

import type { ParsedIngredient, UtteranceResponse } from '../api/types';

export type StateTag = 'Armed' | 'Listening' | 'Processing' | 'Speaking' | 'Done';

export interface SessionContext {
  sessionId: string | null;
  recipeId: string | null;
  currentIngredients: ParsedIngredient[];
  lastResponse: UtteranceResponse | null;
}

export interface MachineState {
  tag: StateTag;
  context: SessionContext;
}

export type Action =
  | { type: 'WAKE_DETECTED' }
  | { type: 'SILENCE_DETECTED' }
  | { type: 'BACKEND_RESPONDED'; response: UtteranceResponse }
  | { type: 'PLAYBACK_ENDED' }
  | { type: 'MANUAL_STOP' }
  | { type: 'FINALIZE' };

export const initialState: MachineState = {
  tag: 'Armed',
  context: {
    sessionId: null,
    recipeId: null,
    currentIngredients: [],
    lastResponse: null,
  },
};

export function reducer(state: MachineState, action: Action): MachineState {
  if (state.tag === 'Done') return state;

  if (action.type === 'FINALIZE') {
    return { ...state, tag: 'Done' };
  }

  switch (state.tag) {
    case 'Armed':
      if (action.type === 'WAKE_DETECTED') return { ...state, tag: 'Listening' };
      return state;

    case 'Listening':
      if (action.type === 'SILENCE_DETECTED') return { ...state, tag: 'Processing' };
      if (action.type === 'MANUAL_STOP') return { ...state, tag: 'Armed' };
      return state;

    case 'Processing':
      if (action.type === 'BACKEND_RESPONDED') {
        return {
          tag: 'Speaking',
          context: {
            ...state.context,
            lastResponse: action.response,
            currentIngredients: action.response.current_ingredients,
          },
        };
      }
      if (action.type === 'MANUAL_STOP') return { ...state, tag: 'Armed' };
      return state;

    case 'Speaking':
      if (action.type === 'PLAYBACK_ENDED') return { ...state, tag: 'Armed' };
      if (action.type === 'MANUAL_STOP') return { ...state, tag: 'Armed' };
      return state;
  }

  return state;
}
