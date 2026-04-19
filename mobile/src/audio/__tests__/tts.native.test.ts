// Native TTS path — mocks expo-av Audio.Sound and removes globalThis.Audio so
// isWeb() returns false inside tts.ts. Mirrors the fire() event-pattern used by
// the web tests in tts.test.ts.

type StatusCb = (status: any) => void;

type SoundMock = {
  unloadAsync: jest.Mock;
};

let mockLatestStatusCb: StatusCb | null = null;
let mockLatestSound: SoundMock | null = null;
let mockCreateAsync: jest.Mock;

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: (...args: any[]) => mockCreateAsync(...args),
    },
  },
}));

describe('playAck / stopAck (native)', () => {
  const realAudio = (globalThis as any).Audio;

  beforeEach(() => {
    jest.resetModules();
    mockLatestStatusCb = null;
    mockLatestSound = { unloadAsync: jest.fn(() => Promise.resolve()) };
    mockCreateAsync = jest.fn(
      async (_src: unknown, _initialStatus: unknown, onStatus?: StatusCb) => {
        mockLatestStatusCb = onStatus ?? null;
        return { sound: mockLatestSound, status: { isLoaded: true } };
      },
    );
    // Force isWeb() === false inside tts.ts.
    delete (globalThis as any).Audio;
  });

  afterEach(() => {
    (globalThis as any).Audio = realAudio;
  });

  it('resolves when the sound reports didJustFinish', async () => {
    const { playAck } = require('../tts');
    const p = playAck('http://backend.test/tts/stream/abc');
    await Promise.resolve();
    await Promise.resolve();
    expect(mockCreateAsync).toHaveBeenCalledTimes(1);
    const [src, initial] = mockCreateAsync.mock.calls[0] as [any, any];
    expect(src).toEqual({ uri: 'http://backend.test/tts/stream/abc' });
    expect(initial).toEqual({ shouldPlay: true });

    mockLatestStatusCb!({ isLoaded: true, didJustFinish: true });
    await expect(p).resolves.toBeUndefined();
    expect(mockLatestSound!.unloadAsync).toHaveBeenCalled();
  });

  it('rejects when status reports an error before load', async () => {
    const { playAck } = require('../tts');
    const p = playAck('http://backend.test/bad');
    await Promise.resolve();
    await Promise.resolve();

    mockLatestStatusCb!({ isLoaded: false, error: 'decoder exploded' });
    await expect(p).rejects.toThrow(/decoder exploded/);
  });

  it('rejects when Audio.Sound.createAsync itself rejects', async () => {
    mockCreateAsync = jest.fn(async () => {
      throw new Error('sound load failed');
    });
    const { playAck } = require('../tts');
    await expect(playAck('http://x')).rejects.toThrow(/sound load failed/);
  });

  it('stopAck resolves an in-flight native playAck and unloads', async () => {
    const { playAck, stopAck } = require('../tts');
    const p = playAck('http://backend.test/tts/stream/abc');
    await Promise.resolve();
    await Promise.resolve();
    stopAck();
    await expect(p).resolves.toBeUndefined();
    expect(mockLatestSound!.unloadAsync).toHaveBeenCalled();
  });
});
