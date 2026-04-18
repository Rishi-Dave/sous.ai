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
  return {
    recipe_id: FIXED_RECIPE_ID,
    macros: { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, per_ingredient: {} },
    ingredients: [],
  };
}
