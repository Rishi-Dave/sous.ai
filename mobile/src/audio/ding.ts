// 150ms acoustic confirmation that plays after wake-word detection and BEFORE
// the mic opens (root CLAUDE.md rule §4.2). Lazy-requires expo-av so the web
// bundle and Jest jsdom env never try to load ExponentAV.
//
// A failure to play the ding must NOT wedge the pipeline — silence the rejection
// and continue; the user just won't hear the tick.

export async function playDing(): Promise<void> {
  try {
    const { Audio } = require('expo-av');
    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/ding.mp3'),
      { shouldPlay: true },
    );
    await new Promise<void>((resolve) => {
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded && status.didJustFinish) resolve();
      });
      // Hard ceiling so a malformed ding doesn't block the flow.
      setTimeout(resolve, 500);
    });
    await sound.unloadAsync().catch(() => {});
  } catch {
    // swallow — see file header
  }
}
