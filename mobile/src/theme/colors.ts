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
} as const;

export type ColorToken = keyof typeof colors;
