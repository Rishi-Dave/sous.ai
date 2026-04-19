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

  it('Speaking → Armed on PLAYBACK_ENDED (no clarification pending)', () => {
    expect(reducer(stateWith('Speaking'), { type: 'PLAYBACK_ENDED' }).tag).toBe('Armed');
  });

  it('Speaking → Listening on PLAYBACK_ENDED when awaiting_clarification=true', () => {
    const clarificationResponse: UtteranceResponse = {
      ...utterance,
      awaiting_clarification: true,
    };
    const speaking = stateWith('Speaking', {
      context: { ...initialState.context, lastResponse: clarificationResponse },
    });
    expect(reducer(speaking, { type: 'PLAYBACK_ENDED' }).tag).toBe('Listening');
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

describe('state machine — clarification re-arm cycle', () => {
  const clarificationResponse: UtteranceResponse = {
    ...utterance,
    awaiting_clarification: true,
  };
  const resolvedResponse: UtteranceResponse = {
    ...utterance,
    awaiting_clarification: false,
  };

  it('clarification Listening accepts SILENCE_DETECTED → Processing', () => {
    const listening = stateWith('Listening');
    expect(reducer(listening, { type: 'SILENCE_DETECTED' }).tag).toBe('Processing');
  });

  it('MANUAL_STOP from clarification Listening returns to Armed', () => {
    const listening = stateWith('Listening');
    expect(reducer(listening, { type: 'MANUAL_STOP' }).tag).toBe('Armed');
  });

  it('full clarification loop: Speaking(pending) → Listening → Processing → Speaking(resolved) → Armed', () => {
    const speaking = stateWith('Speaking', {
      context: { ...initialState.context, lastResponse: clarificationResponse },
    });

    const afterPlayback = reducer(speaking, { type: 'PLAYBACK_ENDED' });
    expect(afterPlayback.tag).toBe('Listening');

    const afterSilence = reducer(afterPlayback, { type: 'SILENCE_DETECTED' });
    expect(afterSilence.tag).toBe('Processing');

    const afterResponse = reducer(afterSilence, {
      type: 'BACKEND_RESPONDED',
      response: resolvedResponse,
    });
    expect(afterResponse.tag).toBe('Speaking');

    const afterResolved = reducer(afterResponse, { type: 'PLAYBACK_ENDED' });
    expect(afterResolved.tag).toBe('Armed');
  });

  it('awaiting_clarification=false (explicit) goes to Armed, not Listening', () => {
    const speaking = stateWith('Speaking', {
      context: { ...initialState.context, lastResponse: resolvedResponse },
    });
    expect(reducer(speaking, { type: 'PLAYBACK_ENDED' }).tag).toBe('Armed');
  });

  it('context carries lastResponse through clarification Listening state', () => {
    const speaking = stateWith('Speaking', {
      context: { ...initialState.context, lastResponse: clarificationResponse },
    });
    const listening = reducer(speaking, { type: 'PLAYBACK_ENDED' });
    expect(listening.context.lastResponse).toBe(clarificationResponse);
  });
});

describe('state machine — session lifecycle', () => {
  it('full golden-path journey: Armed → Listening → Processing → Speaking → Armed', () => {
    let state = initialState;
    state = reducer(state, { type: 'WAKE_DETECTED' });
    expect(state.tag).toBe('Listening');
    state = reducer(state, { type: 'SILENCE_DETECTED' });
    expect(state.tag).toBe('Processing');
    state = reducer(state, { type: 'BACKEND_RESPONDED', response: utterance });
    expect(state.tag).toBe('Speaking');
    state = reducer(state, { type: 'PLAYBACK_ENDED' });
    expect(state.tag).toBe('Armed');
  });

  it('FINALIZE from Speaking mid-clarification ends session in Done', () => {
    const speaking = stateWith('Speaking', {
      context: { ...initialState.context, lastResponse: { ...utterance, awaiting_clarification: true } },
    });
    expect(reducer(speaking, { type: 'FINALIZE' }).tag).toBe('Done');
  });

  it('new initialState after a finalized session is clean', () => {
    let session = initialState;
    session = reducer(session, { type: 'WAKE_DETECTED' });
    session = reducer(session, { type: 'SILENCE_DETECTED' });
    session = reducer(session, { type: 'BACKEND_RESPONDED', response: utterance });
    session = reducer(session, { type: 'PLAYBACK_ENDED' });
    session = reducer(session, { type: 'FINALIZE' });
    expect(session.tag).toBe('Done');

    // New session = new machine instance — initialState is always fresh
    const newSession = initialState;
    expect(newSession.tag).toBe('Armed');
    expect(newSession.context.sessionId).toBeNull();
    expect(newSession.context.currentIngredients).toEqual([]);
    expect(newSession.context.lastResponse).toBeNull();
  });
});

describe('state machine — finish_recipe intent is a normal BACKEND_RESPONDED', () => {
  it('Processing + BACKEND_RESPONDED(finish_recipe) → Speaking with intent stored', () => {
    const finishResponse: UtteranceResponse = {
      intent: 'finish_recipe',
      ack_audio_url: 'mock://ack/finish.mp3',
      current_ingredients: [
        { name: 'olive oil', qty: 1, unit: 'tsp', raw_phrase: 'a splash of olive oil' },
      ],
    };
    const next = reducer(stateWith('Processing'), {
      type: 'BACKEND_RESPONDED',
      response: finishResponse,
    });
    // Reducer is intent-agnostic: the auto-nav behavior lives in the cooking
    // screen, not the reducer. This test locks that contract in.
    expect(next.tag).toBe('Speaking');
    expect(next.context.lastResponse?.intent).toBe('finish_recipe');
    expect(next.context.currentIngredients).toEqual(finishResponse.current_ingredients);
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
