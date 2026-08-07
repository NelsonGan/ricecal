/**
 * Home cooking, as the screens use it.
 *
 * The pure part is `basis.ts`: turning a catalogue serving into something a
 * recipe can be written in, and adding a pot up. It is unit-tested and knows
 * nothing about React, because the arithmetic has to agree with what
 * `recipe_details` computes on the server and a discrepancy there is a form
 * that previews one number and saves another.
 */
export {
  type IngredientBasis,
  ingredientBasis,
  ingredientTotal,
  potTotals,
} from './basis'
export { DescribeRecipePanel, type DescribeRecipePanelProps } from './DescribeRecipePanel'
export { IngredientSheet, type IngredientSheetProps } from './IngredientSheet'
export { RecipePanel, type RecipePanelProps } from './RecipePanel'
export { RecipeRow, type RecipeRowProps } from './RecipeRow'
export { RecipeSteps, splitSteps } from './RecipeSteps'
export { recipeLink, ShareSheet, type ShareSheetProps } from './ShareSheet'
