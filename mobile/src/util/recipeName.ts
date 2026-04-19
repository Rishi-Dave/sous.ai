import type { ParsedIngredient } from '../api/types';

// Derive a human-readable recipe name for POST /finalize when the user hasn't
// named the recipe. Uses the first 3 ingredient names, lowercased.
export function deriveRecipeName(
  recipeId: string | null,
  ingredients: ParsedIngredient[],
): string {
  if (ingredients.length === 0) {
    return recipeId ? `Recipe ${recipeId.slice(0, 8)}` : 'Recipe';
  }
  const names = ingredients.slice(0, 3).map((i) => i.name.toLowerCase());
  return `Recipe with ${names.join(', ')}`;
}
