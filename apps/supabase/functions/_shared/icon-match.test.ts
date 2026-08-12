import { assertEquals as eq } from 'jsr:@std/assert@1'
import { iconFor, matchIcon, TABLE } from './icon-match.ts'
import { ICON_NAMES } from './icons.generated.ts'

// The one failure on this path with no symptom. `icon_name` is free text in D1
// and the column is nullable in Postgres, so a filename that names nothing is
// not an error anywhere — it is a row that renders blank for ever, which looks
// exactly like a row that never had a drawing.
Deno.test('every phrase names a drawing that exists', () => {
  // Widened: `ICON_NAMES` is literal-typed, and this is a runtime lookup by a
  // string the table supplies.
  const known = new Set<string>(Object.values(ICON_NAMES).flat())
  for (const [phrase, icon] of Object.entries(TABLE)) {
    if (icon === null) continue
    if (!known.has(icon)) throw new Error(`"${phrase}" -> "${icon}", which is not a drawing`)
  }
})

Deno.test('the longer phrase wins', () => {
  eq(matchIcon('Fried rice with chicken'), 'nasi-goreng', 'fried rice beats rice')
  eq(matchIcon('Vanilla ice cream'), 'ice-cream', 'ice cream beats cream')
  eq(matchIcon('Condensed milk'), 'condensed-milk', 'condensed milk beats milk')
  eq(matchIcon('Sweet potatoes, boiled'), 'sweet-potato', 'the plural is carried')
})

// Length alone got this backwards: `chocolate` is nine characters and `milk` is
// four, so every chocolate milk in the catalogue drew a bar of chocolate.
Deno.test('a flavour never outranks the food it flavours', () => {
  eq(matchIcon('Chocolate Milk'), 'milk-carton')
  eq(matchIcon('Strawberry Yogurt'), 'yogurt')
  eq(matchIcon('Double Chocolate Chip Cookies'), 'biscuit-stack')
  eq(matchIcon('Chocolate cake'), 'cake-slice')
  // Still wins when it is the whole food.
  eq(matchIcon('Dark Chocolate 70%'), 'chocolate-bar')
})

// `water` matched 251 rows and was wrong on nearly all of them, because it is a
// longer word than `tuna` or `pork` and so beat them to the row.
Deno.test('a preparation word does not steal the food', () => {
  eq(matchIcon('Light Tuna in water'), 'fish')
  eq(matchIcon('Pork, cured, ham and water product'), 'pork-belly')
  eq(matchIcon('Soup, beef broth, prepared with water'), 'beef-slices')
  eq(matchIcon('Mineral water'), 'water-bottle', 'a named drink still resolves')
})

Deno.test('a null entry suppresses the shorter match', () => {
  eq(matchIcon('Caesar salad dressing'), null, 'a bottle of dressing is not greens')
  eq(matchIcon('Garden salad'), 'vegetables')
})

Deno.test('word boundaries are respected', () => {
  eq(matchIcon('Creamer, non-dairy'), null, 'cream must not fire inside creamer')
  eq(matchIcon('Hamburger bun'), 'bun', 'ham must not fire inside hamburger')
})

Deno.test('nothing is not a failure', () => {
  eq(matchIcon('Kellogg Special K'), null)
  eq(matchIcon(''), null)
  eq(matchIcon(null), null)
  eq(matchIcon(undefined), null)
})

Deno.test('iconFor resolves the set a drawing lives in', () => {
  eq(iconFor('Nasi lemak bungkus'), { set: 'dishes', name: 'nasi-lemak' })
  eq(iconFor('UHT Full Cream Milk'), { set: 'food', name: 'milk-carton' })
  eq(iconFor('Kellogg Special K'), null)
})
