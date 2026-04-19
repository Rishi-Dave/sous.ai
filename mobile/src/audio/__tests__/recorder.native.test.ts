// Native recorder — expo-av Audio.Recording. Mocks only the surface we call.

type RecordingMock = {
  stopAndUnloadAsync: jest.Mock;
  getURI: jest.Mock;
};

let mockLatestRecording: RecordingMock | null = null;
let mockCreateAsync: jest.Mock;
let mockRequestPermissions: jest.Mock;
let mockSetAudioMode: jest.Mock;

jest.mock('expo-av', () => ({
  Audio: {
    Recording: {
      createAsync: (...args: any[]) => mockCreateAsync(...args),
    },
    RecordingOptionsPresets: {
      HIGH_QUALITY: { extension: '.m4a' },
    },
    requestPermissionsAsync: (...args: any[]) => mockRequestPermissions(...args),
    setAudioModeAsync: (...args: any[]) => mockSetAudioMode(...args),
  },
}));

describe('native recorder (expo-av)', () => {
  beforeEach(() => {
    jest.resetModules();
    mockLatestRecording = {
      stopAndUnloadAsync: jest.fn(() => Promise.resolve()),
      getURI: jest.fn(() => 'file:///tmp/recording.m4a'),
    };
    mockCreateAsync = jest.fn(async () => ({
      recording: mockLatestRecording,
      status: { isDoneRecording: false },
    }));
    mockRequestPermissions = jest.fn(async () => ({ granted: true }));
    mockSetAudioMode = jest.fn(async () => undefined);
  });

  it('startRecording requests mic perms and flips audio mode into recording', async () => {
    const { startRecording } = require('../recorder');
    await startRecording();

    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    expect(mockCreateAsync).toHaveBeenCalledTimes(1);
  });

  it('startRecording throws if permission is denied', async () => {
    mockRequestPermissions = jest.fn(async () => ({ granted: false }));
    const { startRecording } = require('../recorder');
    await expect(startRecording()).rejects.toThrow(/mic permission denied/);
    expect(mockCreateAsync).not.toHaveBeenCalled();
  });

  it('startRecording rejects a second concurrent call', async () => {
    const { startRecording } = require('../recorder');
    await startRecording();
    await expect(startRecording()).rejects.toThrow(/already recording/);
  });

  it('stopRecording returns the uri + m4a mime and flips audio mode back', async () => {
    const { startRecording, stopRecording } = require('../recorder');
    await startRecording();
    const result = await stopRecording();

    expect(result).toEqual({ uri: 'file:///tmp/recording.m4a', mime: 'audio/m4a' });
    expect(mockLatestRecording!.stopAndUnloadAsync).toHaveBeenCalledTimes(1);
    const last = mockSetAudioMode.mock.calls[mockSetAudioMode.mock.calls.length - 1]![0];
    expect(last).toEqual({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
  });

  it('stopRecording without startRecording throws', async () => {
    const { stopRecording } = require('../recorder');
    await expect(stopRecording()).rejects.toThrow(/not recording/);
  });

  it('cancelRecording is idempotent and flips audio mode back', async () => {
    const { startRecording, cancelRecording } = require('../recorder');
    await startRecording();
    await cancelRecording();
    await cancelRecording(); // second call no-ops

    expect(mockLatestRecording!.stopAndUnloadAsync).toHaveBeenCalledTimes(1);
    const last = mockSetAudioMode.mock.calls[mockSetAudioMode.mock.calls.length - 1]![0];
    expect(last).toEqual({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
  });
});
