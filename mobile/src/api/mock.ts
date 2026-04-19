import mockUtterances from '../mocks/utterances.json';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  FinalizeRequest,
  FinalizeResponse,
  UtteranceResponse,
} from './types';

const FIXED_SESSION_ID = '00000000-0000-4000-8000-000000000001';
const FIXED_RECIPE_ID = '00000000-0000-4000-8000-000000000002';

let cursor = 0;

export async function mockCreateSession(_req: CreateSessionRequest): Promise<CreateSessionResponse> {
  cursor = 0;
  return { session_id: FIXED_SESSION_ID, recipe_id: FIXED_RECIPE_ID };
}

export async function mockSendUtterance(_sessionId: string, _audio: Blob): Promise<UtteranceResponse> {
  const items = mockUtterances as unknown as UtteranceResponse[];
  const next = items[cursor % items.length];
  cursor += 1;
  return next;
}

export async function mockFinalize(_req: FinalizeRequest): Promise<FinalizeResponse> {
  // Realistic macro shape matching the backend/app/routes/finalize.py response
  // post PR #14. per_ingredient keys are the ingredient names; values match the
  // PerIngredientMacro type in api/types.ts.
  return {
    recipe_id: FIXED_RECIPE_ID,
    macros: {
      calories: 418,
      protein_g: 12,
      fat_g: 18,
      carbs_g: 52,
      per_ingredient: {
        'olive oil': { calories: 120, protein_g: 0, fat_g: 14, carbs_g: 0 },
        garlic: { calories: 13, protein_g: 0.6, fat_g: 0, carbs_g: 3 },
        pasta: { calories: 285, protein_g: 11.4, fat_g: 4, carbs_g: 49 },
      },
    },
    ingredients: [
      { name: 'olive oil', qty: 1, unit: 'tsp', raw_phrase: 'a splash of olive oil' },
      { name: 'garlic', qty: 3, unit: 'cloves', raw_phrase: 'three cloves of garlic' },
      { name: 'pasta', qty: 200, unit: 'g', raw_phrase: '200 grams of pasta' },
    ],
  };
}
