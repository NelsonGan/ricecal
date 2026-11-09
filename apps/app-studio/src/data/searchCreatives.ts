import catalog from '../../public/assets/app-store/food-camera/catalog.json';

export const SEARCH_LOCALES = catalog.locales;
export const SEARCH_FOODS = catalog.foods;
export type SearchFood = (typeof SEARCH_FOODS)[keyof typeof SEARCH_FOODS];

/** A locale has exactly one meal, shared by preview, capture, export and upload. */
export function getSearchCreative(locale: string) {
  const copy = SEARCH_LOCALES[locale as keyof typeof SEARCH_LOCALES] ?? SEARCH_LOCALES.en;
  return { ...copy, food: SEARCH_FOODS[copy.foodId as keyof typeof SEARCH_FOODS] };
}
