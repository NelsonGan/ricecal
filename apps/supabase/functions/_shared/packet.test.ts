import { catalogueName, namedProduct } from './packet.ts'

function eq<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ---------------------------------------------------------------------------
// `catalogueName`: what a packet may be called where strangers will read it.
//
// One rule for both writers. The model's reading of a panel and the name a
// person types onto their entry afterwards both end up as the name the next
// scanner of that packet is shown.
// ---------------------------------------------------------------------------

Deno.test('catalogueName keeps a product name, tidied', () => {
  eq(catalogueName('Cheese Chicken Burger'), 'Cheese Chicken Burger', 'a name')
  eq(catalogueName('  Massimo   Blueberry  Bread '), 'Massimo Blueberry Bread', 'spacing')
  eq(catalogueName('小王子麵 (原味)'), '小王子麵 (原味)', 'a name in another script')
  eq(catalogueName('喉糖'), '喉糖', 'two characters are enough')
  eq(catalogueName('7-Eleven Chicken Katsu Tortilla'), '7-Eleven Chicken Katsu Tortilla', 'digits')
})

Deno.test('catalogueName refuses what is not a packet name', () => {
  eq(catalogueName('Packaged food'), null, 'the fallback the scan gave it')
  eq(catalogueName('packaged FOOD'), null, 'in any case')
  eq(catalogueName('Nutrition Facts'), null, 'the table heading')
  eq(catalogueName('Unidentified Food Product'), null, 'the model shrugging')
  eq(catalogueName(null), null, 'nothing at all')
  eq(catalogueName(' a '), null, 'one letter')
  eq(catalogueName('12345'), null, 'no letter in any script')
})

// The typed half. A name somebody types into their own diary is shown to
// everybody who scans that packet after them.
Deno.test('catalogueName refuses a link', () => {
  eq(catalogueName('buy at https://example.com'), null, 'a URL')
  eq(catalogueName('www.example.com crackers'), null, 'a bare domain')
  eq(catalogueName('message me @someone'), null, 'a handle')
})

Deno.test('catalogueName caps the length a row may carry', () => {
  eq(catalogueName('a'.repeat(300))?.length, 120, 'a catalogue name fits the column')
})

Deno.test('namedProduct marks where the name came from', () => {
  const product = namedProduct(
    {
      barcode: 9557753125180,
      kcal: 242,
      carbs_g: 35.6,
      protein_g: 13.6,
      fat_g: 10.4,
      serving_g: 112,
    },
    'Cheese Chicken Burger',
    'user_named',
  )
  eq(product.name, 'Cheese Chicken Burger', 'the name')
  eq(product.source, 'user_named', 'is attributed to the person who typed it')
  eq(product.brand, null, 'and no brand is guessed')
  eq(product.kcal, 242, 'the figures are the panel figures')
})
