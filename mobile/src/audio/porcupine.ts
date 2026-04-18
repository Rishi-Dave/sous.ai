// TODO(rh/wake-word): Porcupine requires the custom dev client on a real device.
// Cannot run on web or Expo Go. See .claude/skills/expo-workflow/SKILL.md.

export async function armPorcupine(_onWake: () => void): Promise<void> {
  return;
}

export async function disarmPorcupine(): Promise<void> {
  return;
}
