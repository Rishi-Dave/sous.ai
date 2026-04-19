describe('playAck / stopAck', () => {
  const realAudio = (globalThis as any).Audio;

  type Listener = () => void;

  function makeAudioMock() {
    const listeners: Record<string, Listener[]> = { ended: [], error: [] };
    const instance = {
      src: '',
      play: jest.fn(() => Promise.resolve()),
      pause: jest.fn(),
      addEventListener: jest.fn((ev: string, cb: Listener) => {
        listeners[ev] ??= [];
        listeners[ev].push(cb);
      }),
      removeEventListener: jest.fn((ev: string, cb: Listener) => {
        listeners[ev] = (listeners[ev] ?? []).filter((l) => l !== cb);
      }),
      fire(ev: 'ended' | 'error') {
        for (const l of listeners[ev] ?? []) l();
      },
    };
    return instance;
  }

  let lastInstance: ReturnType<typeof makeAudioMock> | null = null;

  beforeEach(() => {
    jest.resetModules();
    lastInstance = null;
    (globalThis as any).Audio = jest.fn(function AudioCtor(this: any) {
      lastInstance = makeAudioMock();
      return lastInstance as unknown as HTMLAudioElement;
    });
  });

  afterEach(() => {
    (globalThis as any).Audio = realAudio;
  });

  it('resolves when the audio element fires `ended`', async () => {
    const { playAck } = require('../tts');
    const p = playAck('http://backend.test/tts/stream/abc');
    // The mock is constructed synchronously inside playAck.
    expect(lastInstance).not.toBeNull();
    expect(lastInstance!.src).toBe('http://backend.test/tts/stream/abc');
    expect(lastInstance!.play).toHaveBeenCalledTimes(1);

    lastInstance!.fire('ended');
    await expect(p).resolves.toBeUndefined();
  });

  it('rejects (without hanging) when the audio element fires `error`', async () => {
    const { playAck } = require('../tts');
    const p = playAck('http://backend.test/tts/stream/abc');
    lastInstance!.fire('error');
    await expect(p).rejects.toThrow(/playback failed/);
  });

  it('rejects when audio.play() itself rejects (autoplay policy)', async () => {
    (globalThis as any).Audio = jest.fn(function AudioCtor(this: any) {
      const inst = makeAudioMock();
      inst.play = jest.fn(() => Promise.reject(new Error('NotAllowedError')));
      lastInstance = inst;
      return inst as unknown as HTMLAudioElement;
    });

    const { playAck } = require('../tts');
    await expect(playAck('http://x')).rejects.toThrow(/NotAllowedError/);
  });

  it('stopAck resolves an in-flight playAck (used for MANUAL_STOP)', async () => {
    const { playAck, stopAck } = require('../tts');
    const p = playAck('http://backend.test/tts/stream/abc');
    stopAck();
    await expect(p).resolves.toBeUndefined();
    expect(lastInstance!.pause).toHaveBeenCalled();
  });

  it('stopAck before any playAck is a no-op', () => {
    const { stopAck } = require('../tts');
    expect(() => stopAck()).not.toThrow();
  });
});
