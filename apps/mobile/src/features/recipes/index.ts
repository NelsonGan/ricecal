/**
 * Home cooking, as the screens use it.
 *
 * The pure part is `basis.ts`: turning a catalogue serving into something a
 * recipe can be written in, and adding a pot up. It is unit-tested and knows
 * nothing about React, because the arithmetic has to agree with what
 * `recipe_details` computes on the server and a discrepancy there is a form
 * that previews one number and saves another.
 */

export { AddRecipeCard, type AddRecipeCardProps, type RecipeStart } from './AddRecipeCard'
export {
  type IngredientChoice,
  type IngredientKey,
  ingredientOptions,
  ingredientTotal,
  potTotals,
} from './basis'
export {
  ingredientsInStep,
  MAX_MINUTES,
  matchesFilter,
  normaliseSourceUrl,
  parseMinutes,
  QUICK_MINUTES,
  type RecipeFilter,
  scaleIngredient,
  sourceHost,
  totalMinutes,
} from './cooking'
export { DescribeRecipePanel, type DescribeRecipePanelProps } from './DescribeRecipePanel'
export { IngredientChecklist, type IngredientChecklistProps } from './IngredientChecklist'
export {
  IngredientSheet,
  type IngredientSheetProps,
} from './IngredientSheet'
export { NewRecipeChooser, type NewRecipeChooserProps } from './NewRecipeChooser'
export { ReadingRecipe, type ReadingRecipeProps } from './ReadingRecipe'
export { RecipeCard, type RecipeCardProps } from './RecipeCard'
export {
  type EditableRecipeIngredient,
  RecipeIngredientEditor,
  type RecipeIngredientEditorProps,
} from './RecipeIngredientEditor'
export { RecipeStats } from './RecipeStats'
export { RecipeSteps, splitSteps } from './RecipeSteps'
export { RecipeTile, type RecipeTileProps } from './RecipeTile'
export { ShareSheet, type ShareSheetProps } from './ShareSheet'
export { StepsField, type StepsFieldProps } from './StepsField'
export { recipeLink } from './share'
export { useCopyRecipe } from './useCopyRecipe'
export { useDurationText } from './useDurationText'
export { useIngredientMeasure } from './useIngredientMeasure'
