import type { Food, Serving } from './types'

/**
 * The mock food catalogue.
 *
 * Names are the local spelling and never translate, which is why they live here
 * as data rather than in the i18n bundle. Macros are per one of `servingLabel`.
 *
 * Everything a screen needs about a dish comes from this list, so a screen never
 * hardcodes a calorie number.
 */

const plate: Serving[] = [
  { id: 'plate', label: '1 plate', factor: 1 },
  { id: 'half', label: 'Half', factor: 0.5 },
  { id: 'g100', label: '100g', factor: 0.4 },
]

const piece: Serving[] = [
  { id: 'piece', label: '1 piece', factor: 1 },
  { id: 'half', label: 'Half', factor: 0.5 },
  { id: 'g100', label: '100g', factor: 0.9 },
]

const cup: Serving[] = [
  { id: 'cup', label: '1 cup', factor: 1 },
  { id: 'small', label: 'Small', factor: 0.7 },
  { id: 'large', label: 'Large', factor: 1.4 },
]

const bowl: Serving[] = [
  { id: 'bowl', label: '1 bowl', factor: 1 },
  { id: 'half', label: 'Half', factor: 0.5 },
  { id: 'large', label: 'Large', factor: 1.5 },
]

export const FOODS: readonly Food[] = [
  {
    id: 'nasi-lemak-ayam',
    name: 'Nasi lemak ayam berempah',
    icon: { set: 'dishes', name: 'nasi-lemak' },
    place: 'mamak',
    servingLabel: '1 plate',
    servings: plate,
    macros: { kcal: 640, carbs: 78, protein: 27, fat: 25 },
    timesLogged: 12,
    usualMeals: ['breakfast', 'lunch'],
  },
  {
    id: 'teh-tarik',
    name: 'Teh tarik kurang manis',
    icon: { set: 'dishes', name: 'teh-tarik' },
    place: 'mamak',
    servingLabel: '1 cup',
    servings: cup,
    macros: { kcal: 135, carbs: 18, protein: 3, fat: 5 },
    timesLogged: 21,
    usualMeals: ['breakfast', 'snack'],
  },
  {
    id: 'roti-canai',
    name: 'Roti canai',
    icon: { set: 'dishes', name: 'roti-canai' },
    place: 'mamak',
    servingLabel: '1 piece',
    servings: piece,
    macros: { kcal: 301, carbs: 39, protein: 6, fat: 13 },
    timesLogged: 9,
    usualMeals: ['breakfast'],
  },
  {
    id: 'roti-telur',
    name: 'Roti telur',
    icon: { set: 'dishes', name: 'roti-telur' },
    place: 'mamak',
    servingLabel: '1 piece',
    servings: piece,
    macros: { kcal: 398, carbs: 42, protein: 12, fat: 20 },
    timesLogged: 4,
    usualMeals: ['breakfast'],
  },
  {
    id: 'roti-canai-banjir',
    name: 'Roti canai banjir',
    icon: { set: 'dishes', name: 'roti-canai' },
    place: 'mamak',
    servingLabel: 'With dhal',
    servings: piece,
    macros: { kcal: 352, carbs: 46, protein: 9, fat: 14 },
    usualMeals: ['breakfast'],
  },
  {
    id: 'roti-tisu',
    name: 'Roti tisu',
    icon: { set: 'dishes', name: 'murtabak' },
    place: 'mamak',
    servingLabel: '1 piece',
    servings: piece,
    macros: { kcal: 410, carbs: 61, protein: 7, fat: 16 },
    usualMeals: ['snack'],
  },
  {
    id: 'roti-planta',
    name: 'Roti planta',
    icon: { set: 'dishes', name: 'roti-telur' },
    place: 'mamak',
    servingLabel: '1 piece',
    servings: piece,
    macros: { kcal: 330, carbs: 44, protein: 6, fat: 15 },
    usualMeals: ['breakfast'],
  },
  {
    id: 'char-kuey-teow',
    name: 'Char kuey teow',
    icon: { set: 'dishes', name: 'char-kuey-teow' },
    place: 'hawker',
    servingLabel: '1 plate',
    servings: plate,
    macros: { kcal: 742, carbs: 88, protein: 24, fat: 33 },
    timesLogged: 12,
    usualMeals: ['lunch', 'dinner'],
  },
  {
    id: 'nasi-goreng-kampung',
    name: 'Nasi goreng kampung',
    icon: { set: 'dishes', name: 'nasi-goreng' },
    place: 'hawker',
    servingLabel: '1 plate',
    servings: plate,
    macros: { kcal: 612, carbs: 82, protein: 19, fat: 22 },
    timesLogged: 7,
    usualMeals: ['lunch', 'dinner'],
  },
  {
    id: 'chicken-rice',
    name: 'Nasi ayam',
    icon: { set: 'dishes', name: 'chicken-rice' },
    place: 'kopitiam',
    servingLabel: '1 plate',
    servings: plate,
    macros: { kcal: 585, carbs: 72, protein: 30, fat: 18 },
    timesLogged: 6,
    usualMeals: ['lunch'],
  },
  {
    id: 'laksa',
    name: 'Asam laksa',
    icon: { set: 'dishes', name: 'laksa' },
    place: 'hawker',
    servingLabel: '1 bowl',
    servings: bowl,
    macros: { kcal: 432, carbs: 62, protein: 18, fat: 12 },
    usualMeals: ['lunch', 'dinner'],
  },
  {
    id: 'mee-goreng',
    name: 'Mee goreng mamak',
    icon: { set: 'dishes', name: 'mee-goreng' },
    place: 'mamak',
    servingLabel: '1 plate',
    servings: plate,
    macros: { kcal: 660, carbs: 84, protein: 20, fat: 26 },
    usualMeals: ['lunch', 'dinner'],
  },
  {
    id: 'kaya-toast',
    name: 'Roti bakar kaya',
    icon: { set: 'dishes', name: 'kaya-toast' },
    place: 'kopitiam',
    servingLabel: '2 slices',
    servings: piece,
    macros: { kcal: 285, carbs: 38, protein: 6, fat: 12 },
    usualMeals: ['breakfast'],
  },
  {
    id: 'kopi-o',
    name: 'Kopi o kosong',
    icon: { set: 'dishes', name: 'kopi-o' },
    place: 'kopitiam',
    servingLabel: '1 cup',
    servings: cup,
    macros: { kcal: 12, carbs: 2, protein: 0, fat: 0 },
    timesLogged: 15,
    usualMeals: ['breakfast', 'snack'],
  },
  {
    id: 'half-boiled-eggs',
    name: 'Telur separuh masak',
    icon: { set: 'dishes', name: 'half-boiled-eggs' },
    place: 'kopitiam',
    servingLabel: '2 eggs',
    servings: piece,
    macros: { kcal: 155, carbs: 1, protein: 13, fat: 11 },
    usualMeals: ['breakfast'],
  },
  {
    id: 'satay-ayam',
    name: 'Satay ayam',
    icon: { set: 'dishes', name: 'satay-celup' },
    place: 'hawker',
    servingLabel: '5 sticks',
    servings: [
      { id: 'five', label: '5 sticks', factor: 1 },
      { id: 'ten', label: '10 sticks', factor: 2 },
      { id: 'one', label: '1 stick', factor: 0.2 },
    ],
    macros: { kcal: 290, carbs: 12, protein: 28, fat: 14 },
    usualMeals: ['dinner', 'snack'],
  },
  {
    id: 'cendol',
    name: 'Cendol',
    icon: { set: 'dishes', name: 'cendol' },
    place: 'hawker',
    servingLabel: '1 bowl',
    servings: bowl,
    macros: { kcal: 340, carbs: 56, protein: 3, fat: 12 },
    usualMeals: ['snack'],
  },
  {
    id: 'milo-ais',
    name: 'Milo ais',
    icon: { set: 'dishes', name: 'milo-ais' },
    place: 'mamak',
    servingLabel: '1 glass',
    servings: cup,
    macros: { kcal: 210, carbs: 34, protein: 6, fat: 6 },
    timesLogged: 8,
    usualMeals: ['snack'],
  },
  {
    id: 'nasi-campur',
    name: 'Nasi campur',
    icon: { set: 'dishes', name: 'nasi-campur' },
    place: 'hawker',
    servingLabel: '1 plate',
    servings: plate,
    macros: { kcal: 690, carbs: 86, protein: 28, fat: 26 },
    usualMeals: ['lunch'],
  },
  {
    id: 'sup-kambing',
    name: 'Sup kambing',
    icon: { set: 'dishes', name: 'sup-kambing' },
    place: 'mamak',
    servingLabel: '1 bowl',
    servings: bowl,
    macros: { kcal: 380, carbs: 12, protein: 34, fat: 22 },
    usualMeals: ['dinner'],
  },
  {
    id: 'yong-tau-foo',
    name: 'Yong tau foo',
    icon: { set: 'dishes', name: 'yong-tau-foo' },
    place: 'hawker',
    servingLabel: '6 pieces',
    servings: piece,
    macros: { kcal: 265, carbs: 22, protein: 20, fat: 11 },
    usualMeals: ['lunch', 'dinner'],
  },
  {
    id: 'popiah',
    name: 'Popiah basah',
    icon: { set: 'dishes', name: 'popiah' },
    place: 'hawker',
    servingLabel: '1 roll',
    servings: piece,
    macros: { kcal: 185, carbs: 26, protein: 6, fat: 6 },
    usualMeals: ['snack'],
  },
  {
    id: 'ayam-goreng',
    name: 'Ayam goreng berempah',
    icon: { set: 'dishes', name: 'ayam-goreng' },
    place: 'mamak',
    servingLabel: '1 piece',
    servings: piece,
    macros: { kcal: 320, carbs: 8, protein: 26, fat: 21 },
    usualMeals: ['lunch', 'dinner'],
  },
  {
    id: 'water-plain',
    name: 'Air kosong',
    icon: { set: 'food', name: 'water-glass' },
    place: 'home',
    servingLabel: '1 glass',
    servings: cup,
    macros: { kcal: 0, carbs: 0, protein: 0, fat: 0 },
    usualMeals: ['snack'],
  },
  {
    id: 'protein-shake',
    name: 'Protein shake',
    icon: { set: 'food', name: 'protein-shaker' },
    place: 'packaged',
    servingLabel: '1 scoop',
    servings: cup,
    macros: { kcal: 128, carbs: 4, protein: 24, fat: 2 },
    usualMeals: ['snack'],
  },
  {
    id: 'instant-noodles',
    name: 'Maggi goreng',
    icon: { set: 'food', name: 'instant-noodles' },
    place: 'packaged',
    servingLabel: '1 packet',
    servings: piece,
    macros: { kcal: 430, carbs: 58, protein: 9, fat: 17 },
    usualMeals: ['dinner', 'snack'],
  },
  {
    id: 'pisang-goreng',
    name: 'Pisang goreng',
    icon: { set: 'dishes', name: 'cucur-udang' },
    place: 'hawker',
    servingLabel: '3 pieces',
    servings: piece,
    macros: { kcal: 250, carbs: 38, protein: 3, fat: 10 },
    usualMeals: ['snack'],
  },
  {
    id: 'apple',
    name: 'Epal',
    icon: { set: 'food', name: 'apple' },
    place: 'home',
    servingLabel: '1 fruit',
    servings: piece,
    macros: { kcal: 95, carbs: 25, protein: 0, fat: 0 },
    usualMeals: ['snack'],
  },
] as const

const BY_ID = new Map(FOODS.map((food) => [food.id, food]))

/** Throws on an unknown id: a dangling foodId is a bug in the fixtures, not a runtime state. */
export function getFood(id: string): Food {
  const food = BY_ID.get(id)
  if (!food) throw new Error(`Unknown food id: ${id}`)
  return food
}

export function findFood(id: string): Food | undefined {
  return BY_ID.get(id)
}

export function getServing(food: Food, servingId: string): Serving {
  return food.servings.find((s) => s.id === servingId) ?? food.servings[0]
}
