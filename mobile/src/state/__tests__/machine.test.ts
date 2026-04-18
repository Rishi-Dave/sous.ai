import { initialState, reducer } from '../machine';
import type { MachineState, Action } from '../machine';
import type { UtteranceResponse } from '../../api/types';

const utterance: UtteranceResponse = {
  intent: 'add_ingredient',
  ack_audio_url: 'mock://ack.mp3',
  items: [
    { name: 'olive oil', qty: 1, unit: 'tsp', raw_phrase: 'a splash of olive oil' },
  ],
  current_ingredients: [
    { name: 'olive oil', qty: 1, unit: 'tsp', raw_phrase: 'a splash of olive oil' },
  ],
};

const stateWith = (tag: MachineState['tag'], overrides: Partial<MachineState> = {}): MachineState => ({
  ...initialState,
  tag,
  ...overrides,
});

describe('state machine — initial state', () => {
  it('starts in Armed with empty session context', () => {
    expect(initialState.tag).toBe('Armed');
    expect(initialState.context.sessionId).toBeNull();
    expect(initialState.context.recipeId).toBeNull();
    expect(initialState.context.currentIngredients).toEqual([]);
    expect(initialState.context.lastResponse).toBeNull();
  });
});

describe('state machine — valid transitions', () => {
  it('Armed → Listening on WAKE_DETECTED', () => {
    expect(reducer(stateWith('Armed'), { type: 'WAKE_DETECTED' }).tag).toBe('Listening');
  });

  it('Listening → Processing on SILENCE_DETECTED', () => {
    expect(reducer(stateWith('Listening'), { type: 'SILENCE_DETECTED' }).tag).toBe('Processing');
  });

  it('Processing → Speaking on BACKEND_RESPONDED', () => {
    const next = reducer(stateWith('Processing'), { type: 'BACKEND_RESPONDED', response: utterance });
    expect(next.tag).toBe('Speaking');
  });

  it('Speaking → Armed on PLAYBACK_ENDED', () => {
    expect(reducer(stateWith('Speaking'), { type: 'PLAYBACK_ENDED' }).tag).toBe('Armed');
  });

  it('MANUAL_STOP returns to Armed from any active state', () => {
    for (const tag of ['Listening', 'Processing', 'Speaking'] as const) {
      expect(reducer(stateWith(tag), { type: 'MANUAL_STOP' }).tag).toBe('Armed');
    }
  });

  it('MANUAL_STOP is a no-op from Armed', () => {
    expect(reducer(initialState, { type: 'MANUAL_STOP' })).toBe(initialState);
  });
});

describe('state machine — BACKEND_RESPONDED context updates', () => {
  it('attaches response to context.lastResponse', () => {
    const next = reducer(stateWith('Processing'), { type: 'BACKEND_RESPONDED', response: utterance });
    expect(next.context.lastResponse).toBe(utterance);
  });

  it('replaces currentIngredients with response.current_ingredients', () => {
    const prior = stateWith('Processing', {
      context: { ...initialState.context, currentIngredients: [] },
    });
    const next = reducer(prior, { type: 'BACKEND_RESPONDED', response: utterance });
    expect(next.context.currentIngredients).toEqual(utterance.current_ingredients);
  });
});

describe('state machine — invalid transitions are no-ops', () => {
  const invalidCases: Array<[MachineState['tag'], Action]> = [
    ['Listening', { type: 'WAKE_DETECTED' }],
    ['Processing', { type: 'WAKE_DETECTED' }],
    ['Speaking', { type: 'WAKE_DETECTED' }],
    ['Armed', { type: 'SILENCE_DETECTED' }],
    ['Processing', { type: 'SILENCE_DETECTED' }],
    ['Armed', { type: 'BACKEND_RESPONDED', response: utterance }],
    ['Listening', { type: 'BACKEND_RESPONDED', response: utterance }],
    ['Armed', { type: 'PLAYBACK_ENDED' }],
    ['Listening', { type: 'PLAYBACK_ENDED' }],
  ];

  it.each(invalidCases)('%s + %p returns the same reference (no-op)', (tag, action) => {
    const s = stateWith(tag);
    expect(reducer(s, action)).toBe(s);
  });
});

describe('state machine — FINALIZE is terminal', () => {
  it('any state + FINALIZE → Done', () => {
    for (const tag of ['Armed', 'Listening', 'Processing', 'Speaking'] as const) {
      expect(reducer(stateWith(tag), { type: 'FINALIZE' }).tag).toBe('Done');
    }
  });

  it('Done absorbs all further actions', () => {
    const done = reducer(initialState, { type: 'FINALIZE' });
    const actions: Action[] = [
      { type: 'WAKE_DETECTED' },
      { type: 'SILENCE_DETECTED' },
      { type: 'BACKEND_RESPONDED', response: utterance },
      { type: 'PLAYBACK_ENDED' },
      { type: 'MANUAL_STOP' },
      { type: 'FINALIZE' },
    ];
    for (const a of actions) {
      expect(reducer(done, a)).toBe(done);
    }
  });
});
