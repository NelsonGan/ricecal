import {
  catalogueName,
  type NamedEntry,
  namedProduct,
  nameForPanel,
  type WaitingPanel,
} from './packet.ts'

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

Deno.test('catalogueName refuses a meal rather than a packet', () => {
  eq(catalogueName('Snack'), null, 'a moment in the day')
  eq(catalogueName('lunch'), null, 'in any case')
  eq(catalogueName('Breakfast'), null, 'and the other meals')
  eq(catalogueName('Snack Bar Coklat'), 'Snack Bar Coklat', 'but a product that starts with one')
})

// A name that reads one way and compares another. Each of these got past the
// first version of this check.
Deno.test('catalogueName strips what cannot be seen before judging', () => {
  eq(catalogueName('Packaged\u200B food'), null, 'a zero-width space inside the fallback')
  eq(catalogueName('Nutrition\u200BFacts'), null, 'and inside the heading')
  eq(catalogueName('\u202Eekoc Milo'), 'ekoc Milo', 'a direction override is dropped')
  eq(catalogueName('Milo\u0007\u001b[31m'), 'Milo[31m', 'control characters are dropped')
  eq(catalogueName('Milo\nKosong'), 'Milo Kosong', 'a line break is a space')
})

Deno.test('catalogueName refuses links, handles, numbers and markup in other shapes', () => {
  eq(catalogueName('bit.ly/abc chips'), null, 'a short link')
  eq(catalogueName('shop.example.com'), null, 'a domain')
  eq(catalogueName('order ＠someone'), null, 'a fullwidth at sign')
  eq(catalogueName('call 012-345 6789'), null, 'a phone number')
  eq(catalogueName('<img onerror=x>'), null, 'markup')
  eq(catalogueName('Mr.Bean Crackers'), 'Mr.Bean Crackers', 'but a dot in a name is fine')
  eq(catalogueName('Milo 1.5L'), 'Milo 1.5L', 'and so is a size')
})

Deno.test('catalogueName needs two letters', () => {
  eq(catalogueName('a😀😀😀'), null, 'one letter and emoji')
  eq(catalogueName('7-Up'), '7-Up', 'two letters and a digit')
})

Deno.test('catalogueName caps the length a row may carry', () => {
  eq(catalogueName('a'.repeat(300))?.length, 120, 'a catalogue name fits the column')
  const emoji = catalogueName(`ab${'😀'.repeat(200)}`) ?? ''
  eq(Array.from(emoji).length, 120, 'counted in characters')
  eq(/[\uD800-\uDBFF]$/.test(emoji), false, 'and never cut inside an emoji')
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

// ---------------------------------------------------------------------------
// `nameForPanel`: whether a renamed entry earns its waiting panel a catalogue
// row. Every refusal leaves the panel waiting, so these only decide "not yet".
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-15T03:00:00Z')

const waiting = (over: Partial<WaitingPanel> = {}): WaitingPanel => ({
  barcode: '09557753125180',
  kcal: 242,
  // As PostgREST may send a `numeric`, to prove they are read as numbers.
  carbs_g: '35.6',
  protein_g: 13.6,
  fat_g: 10.4,
  serving_g: '112.0',
  created_at: '2026-10-15T02:25:10Z',
  ...over,
})

const renamed = (over: Partial<NamedEntry> = {}): NamedEntry => ({
  display_label: 'Cheese Chicken Burger',
  base_kcal: 242,
  base_carbs_g: 35.6,
  base_protein_g: '13.6',
  base_fat_g: 10.4,
  override_kcal: null,
  override_carbs_g: null,
  override_protein_g: null,
  override_fat_g: null,
  ...over,
})

const verdict = (entry: NamedEntry, panel: WaitingPanel = waiting()) =>
  nameForPanel(entry, panel, NOW)

Deno.test('nameForPanel writes the panel under the name the owner typed', () => {
  const judged = verdict(renamed())
  if (!('product' in judged)) throw new Error(`expected a row, got: ${judged.reason}`)
  eq(judged.product.barcode, 9557753125180, 'the code, as a number')
  eq(judged.product.name, 'Cheese Chicken Burger', 'the typed name')
  eq(judged.product.carbs_g, 35.6, 'a numeric that came as a string')
  eq(judged.product.serving_g, 112, 'and the serving')
  eq(judged.product.source, 'user_named', 'attributed to a person')
})

Deno.test('nameForPanel waits while the entry is still unnamed', () => {
  eq('reason' in verdict(renamed({ display_label: 'Packaged food' })), true, 'the fallback')
  eq('reason' in verdict(renamed({ display_label: 'Snack' })), true, 'a meal word')
})

// THE refusal this function exists for. The owner is the only person who saw
// the packet, and correcting the figures says the photo was read wrong.
Deno.test('nameForPanel refuses figures the owner has corrected', () => {
  eq('reason' in verdict(renamed({ override_fat_g: 1.5 })), true, 'an override in the sheet')
  eq('reason' in verdict(renamed({ override_kcal: 0 })), true, 'even an override of zero')
  eq('reason' in verdict(renamed({ base_kcal: 480 })), true, 'fix-by-typing re-priced it')
  eq('reason' in verdict(renamed({ base_fat_g: '15.4' })), true, 'or changed one macro')
})

Deno.test('nameForPanel refuses a panel that waited over a month', () => {
  const old = waiting({ created_at: '2026-09-14T02:00:00Z' })
  eq('reason' in verdict(renamed(), old), true, 'thirty-one days')
  const recent = waiting({ created_at: '2026-09-16T04:00:00Z' })
  eq('product' in verdict(renamed(), recent), true, 'twenty-nine days still counts')
  eq('reason' in verdict(renamed(), waiting({ created_at: 'not a date' })), true, 'a bad date')
})
