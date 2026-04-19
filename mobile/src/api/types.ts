// Source of truth: backend/gemini_client/schemas.py + backend/app/schemas/utterance.py.
// These are hand-mirrored TypeScript shapes. Any change to the Pydantic models in
// backend/ is a breaking change to the API contract and must land here in the same PR.
// Run `integration-checker` after any edit to verify symmetry.

export type Intent =
  | 'add_ingredient'
  | 'question'
  | 'acknowledgment'
  | 'small_talk'
  | 'finish_recipe';

export interface ParsedIngredient {
  name: string;
  qty?: number | null;
  unit?: string | null;
  raw_phrase: string;
  action?: 'add' | 'replace';
}

// Response shape from POST /utterance — backend/app/schemas/utterance.py.
export interface UtteranceResponse {
  intent: Intent;
  ack_audio_url: string;
  items?: ParsedIngredient[];
  answer?: string;
  current_ingredients: ParsedIngredient[];
  awaiting_clarification?: boolean;
}

// POST /sessions — backend/app/schemas/session.py.
export interface CreateSessionRequest {
  user_id: string;
}

export interface CreateSessionResponse {
  session_id: string;
  recipe_id: string;
}

// POST /finalize — backend/app/schemas/finalize.py.
export interface FinalizeRequest {
  session_id: string;
  recipe_name: string;
}

export interface PerIngredientMacro {
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  // True when the backend fell back to LLM estimation because Edamam didn't
  // resolve the ingredient. Ingredients with no resolution at all are dropped
  // entirely — they don't appear in this dict.
  estimated?: boolean;
}

export interface MacroLog {
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  per_ingredient: Record<string, PerIngredientMacro>;
}

export interface FinalizeResponse {
  recipe_id: string;
  macros: MacroLog;
  ingredients: ParsedIngredient[];
}
