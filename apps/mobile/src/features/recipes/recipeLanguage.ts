import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import type { Recipe, RecipeIngredient, RecipeTranslation } from '@/data'
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '@/i18n'
import { splitSteps } from './RecipeSteps'

/**
 * An imported recipe in the reader's language, and the switch back to English.
 *
 * The recipe's own text is English, because a recipe from a video is read in
 * every language and English is the one everybody can fall back on. Somebody
 * who imported it with their app in, say, Chinese also gets it in Chinese
 * (`recipes.translations`), and so does every Chinese reader of the community
 * copy. A reader whose language it has not been translated into sees English.
 *
 * Which one is on screen is remembered per recipe while the app is open, as
 * the cook session is, so cook mode shows what the recipe page did. Never
 * persisted: the next visit opens in the reader's language again.
 */
const inEnglish = new Set<string>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * What each language is called on the switch, beside "English". The
 * language's own name for itself, as the picker shows it, and shortened where
 * the picker's is too long for half a small control.
 */
const SWITCH_LABEL: Record<Exclude<Language, 'en'>, string> = {
  'zh-Hans': '中文',
  'zh-Hant': '中文',
  ms: 'Melayu',
  id: 'Indonesia',
  th: 'ไทย',
  vi: 'Tiếng Việt',
  fil: 'Filipino',
  ja: '日本語',
  ko: '한국어',
  hi: 'हिन्दी',
  ta: 'தமிழ்',
  bn: 'বাংলা',
}

export type RecipeLanguage = {
  /** The translation into the reader's language, when the recipe has one. */
  translation?: RecipeTranslation
  /** What the switch calls the reader's language. */
  label: string
  /** Whether the reader asked for English instead. */
  english: boolean
  setEnglish: (english: boolean) => void
}

/** The translation into `language`, when there is one and it is not English. */
export function translationFor(
  recipe: Pick<Recipe, 'translations'> | null | undefined,
  language: Language,
): RecipeTranslation | undefined {
  if (!recipe || language === DEFAULT_LANGUAGE) return undefined
  return recipe.translations?.[language]
}

export function useRecipeLanguage(recipe: Recipe | null | undefined): RecipeLanguage {
  // Subscribes to a language change, so the switch follows the picker.
  const { i18n } = useTranslation()
  const language = isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LANGUAGE
  const id = recipe?.id ?? ''
  const english = useSyncExternalStore(subscribe, () => inEnglish.has(id))

  return {
    translation: translationFor(recipe, language),
    label: language === 'en' ? '' : SWITCH_LABEL[language],
    english,
    setEnglish: (next: boolean) => {
      if (!id) return
      if (next) inEnglish.add(id)
      else inEnglish.delete(id)
      for (const listener of listeners) listener()
    },
  }
}

/** The recipe with its translated name and method, where it has them. */
export function localiseRecipe<T extends Recipe | null | undefined>(
  recipe: T,
  translation: RecipeTranslation | undefined,
): T {
  if (!recipe || !translation) return recipe
  return {
    ...recipe,
    name: translation.name ?? recipe.name,
    steps: translation.steps ?? recipe.steps,
  }
}

/**
 * The recipe as the reader is shown it, for code outside a component: logging
 * from a card writes the name the card shows.
 */
export function shownRecipe(recipe: Recipe, language: Language): Recipe {
  return inEnglish.has(recipe.id)
    ? recipe
    : localiseRecipe(recipe, translationFor(recipe, language))
}

/**
 * The ingredients with their translated names. One the owner added or renamed
 * since keeps its English name, since translations are keyed by the English.
 */
export function localiseIngredients(
  ingredients: RecipeIngredient[],
  translation: RecipeTranslation | undefined,
): RecipeIngredient[] {
  const names = translation?.ingredients
  if (!names) return ingredients
  return ingredients.map((item) => {
    const name = names[item.name]
    return name ? { ...item, name } : item
  })
}

export type CookingStep = {
  /** What the cook reads. */
  text: string
  /**
   * The same step in English, which is what the ingredients it names are
   * found by: a Chinese or Thai step has no spaces to find a word between.
   */
  english: string
}

/**
 * The method as cook mode pages through it.
 *
 * A recipe with a translation is paged a line a step in BOTH languages, the
 * translation beside the English line it translates (the server keeps the two
 * the same length), so switching language mid-cook stays on the same step:
 * the remembered step is one number per recipe. Without a translation the
 * English is split into sentences as it always was. A translation that does
 * not line up is matched by its own words.
 */
export function cookingSteps(
  english: string | undefined,
  translated: string | undefined,
  showTranslation = true,
): CookingStep[] {
  if (!translated) return splitSteps(english ?? '').map((text) => ({ text, english: text }))
  const lines = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  const ours = lines(english ?? '')
  if (!showTranslation) return ours.map((text) => ({ text, english: text }))
  const theirs = lines(translated)
  return theirs.map((text, i) => ({
    text,
    english: theirs.length === ours.length ? (ours[i] ?? text) : text,
  }))
}
