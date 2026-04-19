// Warm Editorial palette — docs/ui.md §2. Exact hex values; never inline.

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
  deepGreenTint: 'rgba(26,71,42,0.06)',
  deepGreenOnCream: 'rgba(26,71,42,0.12)',
  creamSubdued: 'rgba(255,253,232,0.7)',
  goldSoft: 'rgba(239,193,87,0.25)',
  error: '#C62828',
} as const;

export type ColorToken = keyof typeof colors;
