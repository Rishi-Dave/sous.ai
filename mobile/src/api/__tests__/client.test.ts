describe('sendUtterance', () => {
  const ORIGINAL_ENV = process.env;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    globalThis.fetch = realFetch;
  });

  it('POSTs multipart/form-data to /utterance with session_id + audio fields when MOCK is off', async () => {
    process.env.EXPO_PUBLIC_MOCK = '0';
    process.env.EXPO_PUBLIC_BACKEND_URL = 'http://backend.test';

    const fakeResponse = {
      intent: 'add_ingredient',
      ack_audio_url: '/static/ack-stub.mp3',
      items: [],
      current_ingredients: [],
    };
    const fetchMock: jest.Mock = jest.fn(async () => ({
      ok: true,
      json: async () => fakeResponse,
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { sendUtterance } = require('../client');
    const audio = new Blob(['x'], { type: 'audio/webm' });
    const result = await sendUtterance('session-123', audio);

    expect(result).toEqual(fakeResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe('http://backend.test/utterance');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('session_id')).toBe('session-123');
    expect(form.get('audio')).toBeInstanceOf(Blob);
  });

  it('posts a {uri, name, type} file descriptor when handed a native recording', async () => {
    // Node's built-in FormData rejects non-Blob values; RN's polyfill doesn't.
    // Swap in a permissive recorder so the test exercises the append path.
    const realFormData = globalThis.FormData;
    class FakeFormData {
      private parts: Array<{ name: string; value: unknown; fileName?: string }> = [];
      append(name: string, value: unknown, fileName?: string) {
        this.parts.push({ name, value, fileName });
      }
      get(name: string) {
        return this.parts.find((p) => p.name === name)?.value ?? null;
      }
    }
    (globalThis as any).FormData = FakeFormData;

    try {
      process.env.EXPO_PUBLIC_MOCK = '0';
      process.env.EXPO_PUBLIC_BACKEND_URL = 'http://backend.test';

      const fetchMock: jest.Mock = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          intent: 'add_ingredient',
          ack_audio_url: '/tts/stream/x',
          items: [],
          current_ingredients: [],
        }),
      }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const { sendUtterance } = require('../client');
      const audio = { uri: 'file:///tmp/rec.m4a', mime: 'audio/m4a' };
      await sendUtterance('session-123', audio);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const form = init.body as unknown as FakeFormData;
      const part = form.get('audio') as any;
      expect(part).toEqual({
        uri: 'file:///tmp/rec.m4a',
        name: 'audio.m4a',
        type: 'audio/m4a',
      });
      expect(form.get('session_id')).toBe('session-123');
    } finally {
      globalThis.FormData = realFormData;
    }
  });

  it('throws on non-2xx backend response', async () => {
    process.env.EXPO_PUBLIC_MOCK = '0';
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;

    const { sendUtterance } = require('../client');
    await expect(sendUtterance('s1', new Blob(['x']))).rejects.toThrow(/500/);
  });

  it('uses the mock implementation when EXPO_PUBLIC_MOCK=1', async () => {
    process.env.EXPO_PUBLIC_MOCK = '1';
    const fetchMock: jest.Mock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { sendUtterance, createSession } = require('../client');
    await createSession('demo-user');
    const response = await sendUtterance('s1', new Blob(['x']));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response).toHaveProperty('intent');
    expect(response).toHaveProperty('current_ingredients');
  });
});
