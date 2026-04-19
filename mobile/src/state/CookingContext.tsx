import { createContext, useContext, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import { initialState, reducer } from './machine';
import type { Action, MachineState } from './machine';
import type { FinalizeResponse } from '../api/types';

// Context lives at `app/(cooking)/_layout.tsx` so reducer + finalize response
// survive navigation from `[sessionId]` → `summary` (Undo navigates back).
// The reducer file itself is unchanged — this is a hosting container only.

export interface CookingContextValue {
  state: MachineState;
  dispatch: React.Dispatch<Action>;
  finalizeResponse: FinalizeResponse | null;
  setFinalizeResponse: (r: FinalizeResponse | null) => void;
  error: string | null;
  setError: (e: string | null) => void;
}

const Ctx = createContext<CookingContextValue | null>(null);

export function CookingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [finalizeResponse, setFinalizeResponse] = useState<FinalizeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Ctx.Provider
      value={{ state, dispatch, finalizeResponse, setFinalizeResponse, error, setError }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCooking(): CookingContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCooking must be used inside CookingProvider');
  return v;
}
