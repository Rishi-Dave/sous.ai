# Prompt — Hackathon README (paste into a fresh Claude Code plan window)

Copy everything between the `---` markers below into a new Claude Code session with `/plan` active.

---

You're going to write the project README for **Sous Chef**, a hackathon submission. The goal is a README that makes a judge in a hurry understand, in under 90 seconds, (a) what it does, (b) why it's cool, and (c) how to run it — and then gives them depth if they want to stick around. Treat this as a high-stakes design deliverable, not boilerplate.

## Project identity

- **Name:** Sous Chef
- **One-liner:** An AI voice sous chef — tap the mic or say "hey sous", speak ingredients, get back macros and a saved cookbook entry, all hands-free while you cook.
- **Hackathon timeline:** 36 hours. Demo is a 3-minute live walk-through of pasta aglio e olio.
- **Team:** two devs. Rishi Dave (mobile + backend API + integration). Atharva (Gemini utterance-understanding client in `backend/gemini_client/`).
- **Stack:** Expo SDK 54 + React Native, TypeScript strict, FastAPI on Railway, Gemini (utterance parsing), ElevenLabs (voice synthesis), Edamam (macros), Supabase (Postgres + auth), Picovoice Porcupine (wake word).

## What you must do before writing

Before any code, launch up to **3 parallel Explore agents** to map the repo. Do **not** read large files into the main thread. Specifically:

1. One agent reads `docs/design.md` + `.claude/memory/design-doc-summary.md` + `docs/ui.md` and returns a structured digest of: the 3-minute demo script, the Warm Editorial design language, the API contract (§7 of design doc).
2. One agent reads `backend/app/main.py`, `backend/app/routes/*`, `backend/app/schemas/*`, `supabase/migrations/*` and returns: the actual endpoints deployed, the DB schema, what each endpoint does in one sentence.
3. One agent reads `mobile/app/**/*.tsx`, `mobile/src/state/machine.ts`, `mobile/src/audio/*` and returns: the screens + routes, the state machine (Armed → Listening → Processing → Speaking), the audio pipeline's single-consumer rule.

Also read the root `CLAUDE.md` yourself for collaboration rules. Do **not** read `backend/gemini_client/` — it's a pure function imported by the backend; a summary of its role is enough.

After exploration, ask me (the user) a short AskUserQuestion for:
- The demo video URL (YouTube/Vimeo/Loom link) to embed. If I don't have one, a "Demo video coming" placeholder is fine.
- The team-credits section — just names + roles, or also LinkedIn/GitHub handles?
- Whether you should include a "Known limitations / cut for demo" section (recommended: yes — honesty lands well with judges).

## Required sections (in this order)

1. **Header block.** Project name as H1. A single-sentence tagline in italics below. Three badges in a row: build status (GitHub Actions if present, else omit), license (MIT assumed, check `LICENSE`), Python version. Use `shields.io`.
2. **Hero image / GIF.** A screenshot or recorded GIF of the cooking screen mid-session — MicCard listening state with the three gold rings is the money shot. If assets don't exist, leave a clearly-marked `<!-- TODO: add hero.gif -->` placeholder with expected dimensions (recommend 800×450).
3. **What it is (30-second pitch).** Three short paragraphs max. First paragraph: the scenario (you're cooking, hands dirty, you need a helper). Second: what the app does about it. Third: the technical novelty (voice loop, Gemini as the NLU, real macro resolution via Edamam, editorial design language).
4. **Demo.** A prominent link to the demo video. Below it, **the exact 3-minute walk-through script** — 6–8 numbered steps that map to the pasta aglio e olio flow. This lets judges replay without watching. Include expected voice lines ("add three cloves of garlic", "how long should I cook the pasta", "I'm done").
5. **Architecture diagram.** A **mermaid** `flowchart LR` showing: Phone (Porcupine + expo-av) → FastAPI backend → parallel fans to Gemini, Edamam, ElevenLabs, Supabase → response back to phone. Don't overcrowd — 8-10 nodes max.
6. **State machine diagram.** A **mermaid** `stateDiagram-v2` showing Armed → Listening → Processing → Speaking with transition labels (`WAKE_DETECTED`, `SILENCE_DETECTED`, `BACKEND_RESPONDED`, `PLAYBACK_ENDED`). This is a hackathon-winner detail.
7. **Tech stack.** A compact two-column markdown table: what role, what tool. Link each tool's homepage.
8. **Quickstart.** Three top-level subsections: Prereqs (Node 20+, Python 3.12, `uv`, Supabase CLI, Expo account), Backend (`cd backend && uv sync && uvicorn...`), Mobile (`cd mobile && npm ci && npx expo start --tunnel --dev-client`). Include the required `.env` keys for each (names only, with links to where to get them). 4–6 shell blocks total; don't flood it.
9. **Project layout.** A tree (use `├──` box drawing) showing the top two levels plus one level inside `mobile/` and `backend/`. Prune aggressively — `node_modules`, `.expo`, `.venv` don't appear.
10. **What we built in 36 hours.** A checklist of features that actually work (voice loop, cookbook with delete + cook-time, editorial UI, real macros via Edamam, Supabase persistence, ElevenLabs TTS). Tick them with `[x]`.
11. **What we cut and why.** 2–3 items max. Be specific: "Wake word on web (Porcupine is native-only)", "Multi-user auth (demo uses a seeded UUID)". Good judges reward honesty here.
12. **Challenges we hit.** 2–3 bullets. The single-audio-consumer rule (Porcupine vs expo-av conflict), the Gemini clarification loop state, getting Edamam to not tank the whole recipe on one missing ingredient. One sentence each on what went wrong and how you solved it.
13. **Credits.** Team members with their scope (one line each). Link to any pre-existing work used.
14. **License.** One line — "MIT — see [LICENSE](LICENSE)" if that's what the repo has.

## Style and length constraints

- **Target length: 250–350 lines** in the final `.md`. If you're below 200 you haven't said enough; above 400 judges stop reading.
- **No emoji spam**, but one or two section-header emoji is fine (🍳 for the tagline block maximum).
- **No rambling intro paragraph** before the tagline.
- **Code blocks** use language fences (`bash`, `python`, `ts`).
- **Every image reference must point to a real file or have a clearly-labeled `<!-- TODO -->` stub**. Never fabricate paths.
- **Never invent features** — only document what's in the repo. If unsure, grep for it or ask.

## Diagrams

Both diagrams go inline as fenced `mermaid` blocks — GitHub renders them natively. Do **not** generate SVGs or PNGs; mermaid source in markdown is the standard for hackathon READMEs and avoids binary churn.

If the user asks for a third diagram, offer a sequence diagram of a single utterance's round trip (phone → /utterance → Gemini → Supabase write → TTS → ack audio streaming back). Don't add it unprompted — three diagrams is the soft ceiling before it feels like a textbook.

## Output

- Write the README to `/Users/rishidave/Documents/sous-chef/README.md`.
- If a README already exists, **overwrite** it (the hackathon submission README replaces any scaffolding).
- Before writing, show me the section outline with approximate line counts per section so I can redirect if the balance feels off.

## Verification

After writing:
1. `wc -l README.md` — confirm 250–350 lines.
2. `grep -n "TODO" README.md` — print any TODO stubs so I know exactly what still needs filling in (demo video URL, hero image).
3. Paste the two mermaid blocks' source back to me so I can verify they render cleanly on GitHub (mermaid syntax errors only surface on render).

Don't add CI instructions, contributor guidelines, code of conduct, or any other open-source-project boilerplate — this is a hackathon submission, not an open-source library. Keep it crisp.

---
