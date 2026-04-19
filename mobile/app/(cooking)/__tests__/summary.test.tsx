import { render } from '@testing-library/react-native';
import type { FinalizeResponse } from '../../../src/api/types';

// Mock expo-router's router hook — the summary screen only calls `router.back()`
// and `router.replace()`, which we don't exercise in render-only snapshots.
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
}));

// Mock the cooking context so we can inject a canned FinalizeResponse without
// driving the full reducer.
const mockFinalize: FinalizeResponse = {
  recipe_id: 'abc-123',
  macros: {
    calories: 418,
    protein_g: 12,
    fat_g: 18,
    carbs_g: 52,
    per_ingredient: {
      'olive oil': { calories: 120, protein_g: 0, fat_g: 14, carbs_g: 0 },
      garlic: { calories: 13, protein_g: 0.6, fat_g: 0, carbs_g: 3 },
    },
  },
  ingredients: [
    { name: 'olive oil', qty: 1, unit: 'tsp', raw_phrase: 'a splash of olive oil' },
    { name: 'garlic', qty: 3, unit: 'cloves', raw_phrase: 'three cloves of garlic' },
  ],
};

jest.mock('../../../src/state/CookingContext', () => ({
  useCooking: () => ({ finalizeResponse: mockFinalize }),
}));

import SummaryScreen from '../summary';

describe('SummaryScreen', () => {
  it('renders the total calorie metric from FinalizeResponse', () => {
    const { getByText } = render(<SummaryScreen />);
    expect(getByText('Total calories')).toBeTruthy();
    expect(getByText('418')).toBeTruthy();
  });

  it('renders per-ingredient calorie captions from per_ingredient', () => {
    const { getByText } = render(<SummaryScreen />);
    expect(getByText('120 cal')).toBeTruthy();
    expect(getByText('13 cal')).toBeTruthy();
  });

  it('renders the saved-to-cookbook confirmation pill label', () => {
    const { getByText } = render(<SummaryScreen />);
    expect(getByText('Saved to your cookbook')).toBeTruthy();
  });

  it('renders ingredient rows with quantity formatting', () => {
    const { getByText } = render(<SummaryScreen />);
    expect(getByText('olive oil')).toBeTruthy();
    expect(getByText('1 tsp')).toBeTruthy();
    expect(getByText('garlic')).toBeTruthy();
    expect(getByText('3 cloves')).toBeTruthy();
  });
});
