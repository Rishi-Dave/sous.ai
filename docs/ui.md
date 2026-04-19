# Frontend Build Prompt — AI Voice Sous Chef
 
You are Claude Code working on the mobile frontend for an AI voice sous chef built in Expo (React Native). The full project context lives in `sous-chef-design-doc.md` in this directory — read it first if you haven't. This document is authoritative for **everything visual**: design language, color tokens, component patterns, screens to build, and the bar for "done."
 
If anything in this prompt conflicts with what's already in the codebase, stop and ask. Do not invent design decisions that aren't documented here.
 
---
 
## 1. Design language: "Warm Editorial"
 
Think high-end recipe magazine, not tech app. Cream paper as the canvas, deep kitchen green as the editorial voice, gold as a deliberate flourish — never decoration. The user is cooking; the screen is on a counter; the design has to feel inviting and confident at a glance, not busy.
 
The aesthetic test: if a screenshot of any screen would look at home in the side margin of a Bon Appétit article, it's right. If it looks like a productivity app with a green accent color, it's wrong.
 
---
 
## 2. Color system
 
These are the only colors in the app. No shades outside this palette, no opacity tricks to invent intermediate tones.
 
| Token name | Hex | When to use | Never use for |
|---|---|---|---|
| `cream` | `#FFFDE8` | Primary background of every screen. Body text on dark surfaces. | Card surfaces (use white). Buttons. |
| `deepGreen` | `#1A472A` | Header strip backgrounds. Headlines. Primary buttons in summary contexts. Body text on cream. | Body text in long paragraphs (too heavy — use `darkGrey`). |
| `vibrantGreen` | `#34A853` | Primary CTA buttons (`Finish cooking`, `Start cooking`). Success states. The "live" indicator dot. | Headers. Body text. Decorative fills. |
| `mutedGreen` | `#567C65` | Eyebrow labels (small caps above titles). Secondary text. Quantity values in ingredient lists. Inactive icons. | Primary text. CTAs. |
| `metallicGold` | `#EFC157` | **Reserved for two things:** (a) the active microphone ring/button when the app is in the `Listening` state, (b) the "Saved to your cookbook" confirmation pill. That's it. | Anywhere else. See §2.1. |
| `richGold` | `#D4AF37` | Use only as a darker variant of `metallicGold` when text on a gold background needs more contrast. | Standalone — always paired with `metallicGold`. |
| `darkGrey` | `#333333` | Body text, ingredient names, long paragraphs. | Headlines (use `deepGreen`). Eyebrow labels (use `mutedGreen`). |
| `borderGrey` | `#C2C2C2` | Card borders, list dividers, hairlines. | Text. Icons. Backgrounds. |
| `white` | `#FFFFFF` | Card surfaces that float on the cream background. Modal/sheet backgrounds. | Page background (use `cream` — white kills the warmth). |
 
### 2.1 The gold restraint rule
 
Gold is the most powerful color in this palette and the easiest to ruin. The entire design language depends on gold being **rare**. Specifically:
 
- The user should see gold appear at most twice during a normal cooking session: once when the mic activates, once on the saved confirmation at the end.
- Do **not** use gold for: borders on cards, inactive icons, decorative dividers, brand logos, eyebrow text, "premium" badges, or anything that exists on screen continuously.
- If you find yourself reaching for gold to make something feel "special," use weight/spacing/typography first. Gold is a state signal, not a flourish.
This rule is more important than any other color rule. If you violate it, the whole aesthetic collapses into "tacky."
 
### 2.2 Implementation as design tokens
 
Create `src/theme/colors.ts` exporting these as a typed object. All component code references `colors.cream`, never raw hex. This gives us one place to tune values during the demo if needed.
 
```ts
export const colors = {
  cream: '#FFFDE8',
  deepGreen: '#1A472A',
  vibrantGreen: '#34A853',
  mutedGreen: '#567C65',
  metallicGold: '#EFC157',
  richGold: '#D4AF37',
  darkGrey: '#333333',
  borderGrey: '#C2C2C2',
  white: '#FFFFFF',
} as const;
```
 
---
 
## 3. Typography
 
Use the system font stack — no custom font loading for MVP. Expo's default works fine.
 
| Role | Size | Weight | Color | Notes |
|---|---|---|---|---|
| Page title (recipe name) | 22 | 500 | `cream` on green header, `deepGreen` on cream | Sentence case |
| Big metric (total calories) | 42 | 500 | `deepGreen` | Lining numerals if available |
| Section header | 13 | 500 | `deepGreen` | Sentence case |
| Eyebrow label | 11 | 500 | `mutedGreen` | UPPERCASE, letterSpacing ~0.08em |
| Body / ingredient name | 14 | 400 | `darkGrey` | |
| Quantity tag | 13 | 400 | `mutedGreen` | Right-aligned in list rows |
| Button label | 15 | 500 | `cream` (on vibrant green) or `deepGreen` (on gold) | Sentence case |
| Caption / timestamp | 11 | 400 | `mutedGreen` opacity 0.75 | |
 
**Two weights only: 400 (regular), 500 (medium).** Do not use 600/700 — too heavy against the warm palette.
 
---
 
## 4. Spacing & layout primitives
 
- Page padding: 20px horizontal, 18px top
- Vertical rhythm between sections: 18px
- Card padding: 14–16px
- Border radius: cards 16px, buttons 14px, mic button 50% (circular), header strip none
- Borders: 1px solid `borderGrey` for cards, 1px solid `metallicGold` for the active mic card
- Dividers: 1px solid `borderGrey`, full width
- **No drop shadows.** This is a flat design. Depth comes from color contrast (white card on cream), not from shadow.
---
 
## 5. The four atomic components
 
Build these first in `src/components/`. Every screen is composed of these four.
 
### 5.1 `<HeaderStrip>`
 
The deep green slab that sits at the top of every cooking screen.
 
```tsx
<HeaderStrip eyebrow="Cooking now" title="Pasta aglio e olio" subtitle="7 ingredients · 12 min" />
```
 
- Background: `deepGreen`, no border radius
- Padding: 14px top, 18px bottom, 20px horizontal
- Eyebrow: `cream` at opacity 0.7, eyebrow label style
- Title: `cream`, page title style, marginTop 4
- Subtitle: `cream` at opacity 0.75, 13/400, marginTop 2
- Subtitle is optional
### 5.2 `<MicCard>`
 
The active state of the voice interface. Has 4 visual states matching the state machine.
 
```tsx
<MicCard state="armed | listening | processing | speaking" transcript="..." />
```
 
| State | Visual |
|---|---|
| `armed` | White card, `borderGrey` border, gold circular button on left with mic icon, label "Tap or say 'hey sous'" in `mutedGreen` |
| `listening` | White card, `metallicGold` border (1px), filled `metallicGold` circle on left with mic icon in `deepGreen`, eyebrow "Listening" in `mutedGreen`, live transcript in `darkGrey` below |
| `processing` | White card, `borderGrey` border, gold circle replaced by a spinner (use `ActivityIndicator` color `metallicGold`), label "Thinking…" in `mutedGreen` |
| `speaking` | White card, `borderGrey` border, animated waveform (3–5 vertical bars in `vibrantGreen`, stagger-pulsing), eyebrow "Chef is talking" in `mutedGreen`, the assistant's text below |
 
The card itself stays the same shape and position across all four states — only the inner contents swap. This is critical for visual continuity. Don't animate the card; animate the contents.
 
### 5.3 `<IngredientRow>`
 
```tsx
<IngredientRow name="Olive oil" quantity="2 tbsp" />
```
 
- Horizontal flex, `space-between`
- 10px vertical padding
- 1px `borderGrey` bottom border (last row in a list omits it)
- Name: 14/400 `darkGrey`
- Quantity: 13/400 `mutedGreen`
Group multiple rows under an eyebrow label "Ingredients" (count optional).
 
### 5.4 `<MacroCard>` and `<MacroSummary>`
 
`<MacroCard>` is one of three small cards in a row.
 
```tsx
<MacroCard label="Protein" value="18g" />
```
 
- White background, 1px `borderGrey` border, 12px radius
- Padding: 12px vertical, 8px horizontal
- Label: 11/500 UPPERCASE `mutedGreen`, letterSpacing 0.05em
- Value: 18/500 `deepGreen`, marginTop 4
- Center-aligned
`<MacroSummary>` is the full block:
 
```tsx
<MacroSummary calories={612} protein={18} fat={24} carbs={81} />
```
 
- Centered eyebrow "Total calories" in `mutedGreen`
- 42/500 `deepGreen` calorie number below
- Three `<MacroCard>` in a row with 8px gap, 12px above
---
 
## 6. Buttons
 
Two button types only.
 
**Primary CTA** (`Start cooking`, `Finish cooking`, `Save to cookbook`):
- Background: `vibrantGreen`
- Text: `cream`, 15/500, sentence case
- Padding: 14px vertical
- Border radius: 14px
- Full-width within its container
- No border, no shadow
**Confirmation pill** (the "Saved to your cookbook" indicator after finalize):
- Background: `metallicGold`
- Text: `deepGreen`, 12/500
- Padding: 14px vertical, full width
- Border radius: 12px
- Shows briefly after the macro summary appears
There is no "secondary" or "ghost" button. If you need a less prominent action, make it a text link in `mutedGreen`.
 
---
 
## 7. Iconography
 
Use **`lucide-react-native`**. Install once, use everywhere — do not hand-author SVGs and do not mix icon libraries.
 
```bash
npx expo install lucide-react-native react-native-svg
```
 
| Icon name in lucide | Use for |
|---|---|
| `Mic` | The mic button in `<MicCard>`, sized 22 |
| `Loader2` | Processing spinner (rotate it manually) |
| `Check` | Finalize confirmations, sized 16 inline |
| `ChevronRight` | List row affordances if any, sized 16 |
| `BookOpen` | Cookbook / saved recipes, sized 22 |
| `X` | Cancel / dismiss, sized 22 |
 
Default icon size: 22 in interactive controls, 16 inline with text. Default stroke: 2.2. Default color: matches surrounding text color, not arbitrary.
 
---
 
## 8. Screens to build
 
Build in this order. Each screen lists what state it shows and what data it needs.
 
### Priority 1 — required for the demo
 
1. **`(home)/index.tsx` — Start screen.** Cream background, centered logo or wordmark in `deepGreen`, primary CTA "Start cooking" near bottom. Below the CTA: a small list of recent recipes if any exist (3 rows max), otherwise empty state with an eyebrow "Your cookbook is empty" in `mutedGreen`.
2. **`(cooking)/[sessionId].tsx` — Active cooking session.** This is the core screen. Composition:
   - `<HeaderStrip>` at top with the recipe name (default "Untitled dish" until the user names it)
   - `<MicCard>` driven by the session state machine (Armed/Listening/Processing/Speaking)
   - `<IngredientRow>` list, growing as ingredients arrive from the backend
   - "Finish cooking" primary CTA at the bottom
   **State variants this screen must handle:**
   - Empty session (no ingredients yet): the ingredient list shows an eyebrow "Tonight's mise en place" with placeholder text in `mutedGreen` "Tell me what you're using…"
   - Clarification pending: the `<MicCard>` is in `speaking` state and shows the chef's question (e.g., "How much olive oil — about a teaspoon?")
   - Q&A response: same — `<MicCard>` in `speaking` state with the answer text. No ingredients added.
3. **`(cooking)/summary.tsx` — Finalize / macro summary.** Composition:
   - `<HeaderStrip>` with eyebrow "Recipe complete" and the recipe name
   - `<MacroSummary>` block
   - Confirmation pill ("Saved to your cookbook") that animates in 800ms after mount
   - Below: the full ingredient list (use `<IngredientRow>` again, this time with macro breakdown if available — small caption under each name showing "120 cal")
   - Bottom CTA: "Done" → returns to home
### Priority 2 — only if MVP solid
 
4. **`(cookbook)/index.tsx` — Recipe history.** Card grid of saved recipes. Skip until everything else works.
---
 
## 9. Animation rules
 
Keep it minimal. Animations exist to communicate state, not delight.
 
- State transitions in `<MicCard>`: 200ms cross-fade between inner contents. Card itself never moves.
- New `<IngredientRow>` arriving: slide in from below 8px + fade in over 220ms. Subsequent rows do not re-animate.
- Mic button in `armed` state: subtle pulse (scale 1.0 → 1.05 → 1.0 over 1.6s, infinite). Stop pulsing in any other state.
- Speaking waveform: 3-bar stagger, 0.6s loop, vibrant green.
- Confirmation pill on summary screen: fade in + slide up 12px, 800ms after mount.
Use `react-native-reanimated` if it's already in the project; otherwise use the built-in `Animated` API. Don't add a new animation library for this.
 
---
 
## 10. Stack-specific notes
 
- **Mock the backend during web/UI work.** The audio module and API client should be platform-shimmed so that on web, the wake word is replaced by a button and the backend can return canned responses from `src/mocks/utterances.json`. See the design doc §11 for the pattern.
- **Use Expo Router.** File-based routing matches the screen list above. `(home)`, `(cooking)`, `(cookbook)` are route groups.
- **State machine** lives in `src/state/machine.ts` — pure reducer, no side effects. The screen reads from it via context. Tests for the reducer are non-negotiable (see design doc §11 testing section).
- **No new dependencies without flagging in the PR description.** Stack already includes Expo, expo-av, expo-router, lucide-react-native, react-native-reanimated. Anything else needs justification.
---
 
## 11. Anti-patterns — do not do these
 
1. **Gold sprinkled everywhere.** Re-read §2.1. If gold appears on more than the active mic and the saved pill, you've broken the design.
2. **White as page background.** The page is always `cream`. White is for cards floating on cream.
3. **Drop shadows or gradients.** This is flat. Depth = color contrast, not effects.
4. **Heavy weights (600+).** Headlines are 500. Anything heavier looks aggressive against the warm palette.
5. **System font weights named "bold."** Use the numeric weight (`fontWeight: '500'`) so behavior is consistent across iOS and Android.
6. **Decorative dividers between every element.** Dividers exist inside the ingredient list and nowhere else. Whitespace separates everything else.
7. **Inventing new colors.** The palette in §2 is the entire palette. No "slightly lighter green," no "warmer cream." If you need a new tone, stop and ask.
8. **Replacing the icon library.** Lucide-react-native, period.
9. **Animating the `<MicCard>` shell.** Only the contents animate. The shell is a stable anchor — that's why the design works across four states.
10. **Title Case in headlines or buttons.** Sentence case throughout. "Start cooking", not "Start Cooking".
---
 
## 12. Definition of done
 
A screen is done when:
 
- [ ] All copy uses sentence case
- [ ] All colors come from `src/theme/colors.ts`, no inline hex
- [ ] All icons come from `lucide-react-native`
- [ ] Renders correctly on web (Chrome) and on the Expo dev build (iOS) — no platform-specific layout breaks
- [ ] The state machine drives all visible state — no `useState` for things that should live in the reducer
- [ ] No drop shadows, no gradients, no font weights outside 400/500
- [ ] Gold appears only in the documented places (§2.1)
- [ ] A snapshot test exists for at least one variant (e.g., the listening state of the cooking screen)
- [ ] The screen looks right at iPhone 14 Pro and iPhone SE viewport widths (390pt and 375pt)
---
 
## 13. Reference for the visual target
 
The chosen design is "Option A — Warm Editorial" from the design exploration. The key reference images live in `docs/design-references/` (or, if those don't exist, ask before guessing). The cooking screen and summary screen mockups in those references are the source of truth — when in doubt, replicate them, do not improvise.
 
If you find yourself making a visual decision that isn't covered by this prompt, **stop and ask**. The design language is tight on purpose — there are not five right answers, there's one. Asking takes 30 seconds; rebuilding a wrong screen takes an hour.