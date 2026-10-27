// Every hosted prompt's own copy in the code, by its PostHog name.
//
// Only the drift script and the tests read this. The functions never import it:
// it pulls in every module that talks to a model, and each call site already
// names its own prompt.

import { REVIEW_PROMPT } from '../social/review.ts'
import {
  ANALYSE_PHOTO_PROMPT,
  DESCRIBE_MEAL_PROMPT,
  ESTIMATE_NUTRITION_PROMPT,
  INTERPRET_INSTRUCTION_PROMPT,
  PHOTO_NOTE_RULES,
  PICK_CANDIDATE_PROMPT,
} from './llm.ts'
import type { PromptName } from './prompts.ts'
import { DESCRIBE_RECIPE_PROMPT, READ_RECIPE_PROMPT, REVIEW_RECIPE_PROMPT } from './recipe.ts'
import { SUGGEST_MEAL_PROMPT } from './suggest.ts'

export const BUNDLED_PROMPTS: Record<PromptName, string> = {
  'analyse-photo': ANALYSE_PHOTO_PROMPT,
  'analyse-photo-note': PHOTO_NOTE_RULES,
  'describe-meal': DESCRIBE_MEAL_PROMPT,
  'pick-candidate': PICK_CANDIDATE_PROMPT,
  'estimate-nutrition': ESTIMATE_NUTRITION_PROMPT,
  'interpret-instruction': INTERPRET_INSTRUCTION_PROMPT,
  'read-recipe-photo': READ_RECIPE_PROMPT,
  'describe-recipe': DESCRIBE_RECIPE_PROMPT,
  'review-recipe': REVIEW_RECIPE_PROMPT,
  'suggest-meals': SUGGEST_MEAL_PROMPT,
  'moderate-submission': REVIEW_PROMPT,
}
