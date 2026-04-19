import { deriveRecipeName } from '../recipeName';
import type { ParsedIngredient } from '../../api/types';

function ing(name: string): ParsedIngredient {
  return { name, raw_phrase: name };
}

describe('deriveRecipeName', () => {
  it('lowercases and joins the first three ingredient names', () => {
    expect(
      deriveRecipeName('abc-123', [ing('Olive Oil'), ing('Garlic'), ing('Pasta')]),
    ).toBe('Recipe with olive oil, garlic, pasta');
  });

  it('stops after three ingredients even when more are present', () => {
    expect(
      deriveRecipeName('abc-123', [
        ing('Olive Oil'),
        ing('Garlic'),
        ing('Pasta'),
        ing('Salt'),
        ing('Pepper'),
      ]),
    ).toBe('Recipe with olive oil, garlic, pasta');
  });

  it('falls back to the recipe id prefix when no ingredients are logged', () => {
    expect(deriveRecipeName('abcdef0123456789', [])).toBe('Recipe abcdef01');
  });

  it('falls back to a generic label when recipe id is also missing', () => {
    expect(deriveRecipeName(null, [])).toBe('Recipe');
  });
});
