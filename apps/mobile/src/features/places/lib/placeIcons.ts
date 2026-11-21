import type { IconRef } from '@/data'

/**
 * Apple's PoiCategory values (README: Meal locations) onto the app's own clay
 * drawings. Only the kinds of place people eat or drink at get a dish; every
 * other category, and a spot with no category at all, is a pin.
 */
const ICON_BY_CATEGORY: Record<string, IconRef> = {
  Restaurant: { set: 'food', name: 'fork-spoon' },
  FoodMarket: { set: 'food', name: 'fork-spoon' },
  Cafe: { set: 'food', name: 'coffee' },
  Bakery: { set: 'food', name: 'bread-loaf' },
  Brewery: { set: 'food', name: 'beer-mug' },
  Winery: { set: 'food', name: 'beer-mug' },
  Distillery: { set: 'food', name: 'beer-mug' },
  Nightlife: { set: 'food', name: 'beer-mug' },
}

const PIN: IconRef = { set: 'ui', name: 'location' }

export function placeCategoryIcon(category: string | null | undefined): IconRef {
  // Own keys only: the category is data from the server, and "constructor" is
  // not an icon.
  return category && Object.hasOwn(ICON_BY_CATEGORY, category)
    ? (ICON_BY_CATEGORY[category] as IconRef)
    : PIN
}
