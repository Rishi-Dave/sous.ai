// Mocks for the native modules. Jest hoists jest.mock calls; only `mock*`-prefixed
// identifiers may be referenced inside the factory bodies.

const mockManager = {
  start: jest.fn(async () => {}),
  stop: jest.fn(async () => {}),
};
const mockFromKeywordPaths = jest.fn();

jest.mock('@picovoice/porcupine-react-native', () => ({
  PorcupineManager: {
    fromKeywordPaths: mockFromKeywordPaths,
  },
}));

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({
      downloadAsync: async () => {},
      localUri: 'file:///tmp/hey_sous.ppn',
      uri: 'asset:///hey_sous.ppn',
    }),
  },
}));

// The require('../../assets/hey_sous.ppn') inside porcupine.ts has no JS-side meaning
// in Jest — the asset transformer doesn't know about .ppn. Virtual-mock it.
jest.mock('../../../../assets/hey_sous.ppn', () => 'mock-ppn-asset-id', { virtual: true });

describe('porcupine — armPorcupine / disarmPorcupine', () => {
  beforeEach(() => {
    jest.resetModules();
    mockManager.start.mockClear();
    mockManager.stop.mockClear();
    mockFromKeywordPaths.mockReset();
    mockFromKeywordPaths.mockResolvedValue(mockManager);
    process.env.EXPO_PUBLIC_PICOVOICE_ACCESS_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_PICOVOICE_ACCESS_KEY;
  });

  it('initializes PorcupineManager with the access key, .ppn path, and sensitivity 0.5', async () => {
    const { armPorcupine } = require('../porcupine');
    await armPorcupine(() => {});

    expect(mockFromKeywordPaths).toHaveBeenCalledTimes(1);
    const args = mockFromKeywordPaths.mock.calls[0];
    expect(args[0]).toBe('test-key');
    expect(args[1]).toEqual(['/tmp/hey_sous.ppn']); // 'file://' prefix stripped
    expect(typeof args[2]).toBe('function'); // detection callback
    expect(args[6]).toEqual([0.5]); // sensitivities
  });

  it('starts the manager on arm and stops it on disarm', async () => {
    const { armPorcupine, disarmPorcupine } = require('../porcupine');
    await armPorcupine(() => {});
    expect(mockManager.start).toHaveBeenCalledTimes(1);

    await disarmPorcupine();
    expect(mockManager.stop).toHaveBeenCalledTimes(1);
  });

  it('invokes onWake when the underlying detection callback fires', async () => {
    const { armPorcupine } = require('../porcupine');
    const onWake = jest.fn();
    await armPorcupine(onWake);

    const detectionCallback = mockFromKeywordPaths.mock.calls[0][2];
    detectionCallback(0);
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it('reuses the manager across re-arms and routes to the new onWake', async () => {
    const { armPorcupine, disarmPorcupine } = require('../porcupine');
    const firstOnWake = jest.fn();
    const secondOnWake = jest.fn();

    await armPorcupine(firstOnWake);
    await disarmPorcupine();
    await armPorcupine(secondOnWake);

    expect(mockFromKeywordPaths).toHaveBeenCalledTimes(1); // singleton survives
    expect(mockManager.start).toHaveBeenCalledTimes(2);

    const detectionCallback = mockFromKeywordPaths.mock.calls[0][2];
    detectionCallback(0);
    expect(firstOnWake).not.toHaveBeenCalled();
    expect(secondOnWake).toHaveBeenCalledTimes(1);
  });

  it('disarmPorcupine before any arm is a safe no-op', async () => {
    const { disarmPorcupine } = require('../porcupine');
    await expect(disarmPorcupine()).resolves.toBeUndefined();
    expect(mockManager.stop).not.toHaveBeenCalled();
  });

  it('throws a clear error when the Picovoice access key is missing', async () => {
    delete process.env.EXPO_PUBLIC_PICOVOICE_ACCESS_KEY;
    const { armPorcupine } = require('../porcupine');
    await expect(armPorcupine(() => {})).rejects.toThrow(/EXPO_PUBLIC_PICOVOICE_ACCESS_KEY/);
  });
});
