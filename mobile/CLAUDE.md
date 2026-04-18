# mobile/ — Expo (React Native) client

You are working in the mobile app. The root `CLAUDE.md` is authoritative; this file layers mobile-specific rules on top.

## Dev loops

Three parallel loops. Pick the cheapest one that exercises the change you're making.

| Loop | When | Command |
|---|---|---|
| **Web** | UI work, state machine, mocked backend — 80% of work | `cd mobile && npx expo start`, press `w` |
| **Dev build on phone** | Porcupine, real audio capture, full end-to-end | `eas build --profile development --platform ios` (~15–30 min), then `npx expo start --dev-client` |
| **Expo Go** | Never. Porcupine is a native module. Expo Go cannot load it. | — |

Mock the slow parts when on web:
```ts
const MOCK = Platform.OS === 'web' || process.env.EXPO_PUBLIC_MOCK === '1';
const onWakeWord = MOCK ? mockButton : startPorcupine;
const sendUtterance = MOCK ? mockBackend : realBackend;
```

Keep mock payloads at `mobile/src/mocks/utterances.json` so UI work cycles through realistic responses.

## Layout

```
mobile/
├── app/                    Expo Router screens
├── src/
│   ├── audio/              Porcupine + VAD + expo-av recording
│   ├── state/              Reducer for Armed → Listening → Processing → Speaking
│   ├── api/                Backend client (every endpoint has a mock counterpart)
│   └── mocks/
├── assets/
│   ├── hey_chef.ppn
│   └── ding.mp3
└── eas.json
```

## Rules

- **State reducer is canonical.** `src/state/` implements the Armed/Listening/Processing/Speaking machine. Don't rewrite its transition logic without asking — the rules in root `CLAUDE.md` (audio-consumer exclusivity, 300ms re-arm buffer, 150ms ding) encode actual bugs from the design doc §4.
- **Never talk directly to Gemini / ElevenLabs / Edamam.** The backend is the only server the app knows about.
- **API client shape follows the backend contract** (design doc §7). If the backend response changes, update `src/api/types.ts` first, then the mock, then the consumers.
- **`EXPO_PUBLIC_MOCK=1`** unblocks all UI work without a running backend. Use it.

## Testing

- Jest + React Native Testing Library.
- **Full coverage on the state reducer** — it's pure logic, easy to test, and the place bugs hide.
- **Sparse snapshots on UI** components — only where rendering logic is non-trivial.
- **No coverage chasing on animations.**
- The API client gets tests against the mock responses.

## Common failures

See `.claude/skills/expo-workflow/SKILL.md` and `.claude/skills/voice-pipeline-debug/SKILL.md` for runbooks. Don't pattern-match — read the actual error output first.
