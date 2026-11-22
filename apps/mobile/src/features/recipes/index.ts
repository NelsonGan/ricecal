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
  AddRecipeTiles,
  type AddRecipeTilesProps,
  type RecipeStart,
} from './AddRecipeTiles'
export {
  type IngredientChoice,
  type IngredientKey,
  ingredientOptions,
  ingredientTotal,
  potTotals,
} from './basis'
export {
  ingredientsInStep,
  normaliseSourceUrl,
  parseMinutes,
  sourceHost,
} from './cooking'
export { forgetCookSession, useCookStep, useTickedIngredients } from './cookSession'
export { DescribeRecipePanel, type DescribeRecipePanelProps } from './DescribeRecipePanel'
export { ImportVideoPanel, type ImportVideoPanelProps } from './ImportVideoPanel'
export { IngredientChecklist, type IngredientChecklistProps } from './IngredientChecklist'
export {
  IngredientSheet,
  type IngredientSheetProps,
} from './IngredientSheet'
export { LogRecipeSheet, type LogRecipeSheetProps } from './LogRecipeSheet'
export { PlatformLogo, type PlatformLogoProps } from './PlatformLogo'
export {
  clearRecipeRead,
  type PendingRecipeRead,
  peekRecipeRead,
  stageRecipeRead,
} from './pendingRead'
export { ReadingRecipe, type ReadingRecipeProps } from './ReadingRecipe'
export { RecipeCard, type RecipeCardProps } from './RecipeCard'
export {
  type EditableRecipeIngredient,
  RecipeIngredientEditor,
  type RecipeIngredientEditorProps,
} from './RecipeIngredientEditor'
export { RecipeNutrition, RecipeStats } from './RecipeStats'
export { RecipeSteps, splitSteps } from './RecipeSteps'
export { ShareSheet, type ShareSheetProps } from './ShareSheet'
export { StepsField, type StepsFieldProps } from './StepsField'
export { recipeLink } from './share'
export { useCopyRecipe } from './useCopyRecipe'
export { useIngredientMeasure } from './useIngredientMeasure'
export { useLogRecipe, useRecipeLogDate } from './useLogRecipe'
export { type FoundVideoLink, findVideoLink, VIDEO_PLATFORMS } from './videoLink'
