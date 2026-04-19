// Typography — docs/ui.md §2. System fonts, weights 400/500 only.
// letterSpacing in RN is absolute (px). 0.08em @ 11px ≈ 0.88. 0.05em @ 11px ≈ 0.55.

import type { TextStyle } from 'react-native';

export const typography = {
  pageTitle: { fontSize: 22, fontWeight: '500' } satisfies TextStyle,
  bigMetric: { fontSize: 42, fontWeight: '500' } satisfies TextStyle,
  sectionHeader: { fontSize: 13, fontWeight: '500' } satisfies TextStyle,
  eyebrow: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  } satisfies TextStyle,
  eyebrowTight: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  } satisfies TextStyle,
  body: { fontSize: 14, fontWeight: '400' } satisfies TextStyle,
  quantity: { fontSize: 13, fontWeight: '400' } satisfies TextStyle,
  button: { fontSize: 15, fontWeight: '500' } satisfies TextStyle,
  caption: { fontSize: 11, fontWeight: '400' } satisfies TextStyle,
  macroValue: { fontSize: 18, fontWeight: '500' } satisfies TextStyle,
  wordmark: { fontSize: 36, fontWeight: '500' } satisfies TextStyle,
};
