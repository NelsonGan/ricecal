import { assertEquals as eq } from 'jsr:@std/assert@1'
import { iconFor, matchIcon, SCRIPT_TABLE, TABLE, WEAK_PHRASES } from './icon-match.ts'
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
  // A bowl of soup, now that there is a drawing of one. It answered
  // `beef-slices` before the second sheet arrived, which was the best available
  // rather than the right one.
  eq(matchIcon('Soup, beef broth, prepared with water'), 'soup-bowl')
  eq(matchIcon('Mineral water'), 'water-bottle', 'a named drink still resolves')
})

// This was `null` until there was a drawing of a dressing bottle to point at.
// The bug it guards against is unchanged: a bottle of dressing must not inherit
// the salad's greens.
Deno.test('a dressing is a bottle, not a plate of greens', () => {
  eq(matchIcon('Caesar salad dressing'), 'salad-dressing')
  eq(matchIcon('Salad dressing, caesar, low calorie'), 'salad-dressing')
  eq(matchIcon('Garden salad'), 'vegetables')
})

Deno.test('word boundaries are respected', () => {
  eq(matchIcon('Creamer, non-dairy'), null, 'cream must not fire inside creamer')
  // `ham` is a whole word here and must not fire inside another one. Checked
  // against "graham" rather than "hamburger", which is now itself a phrase.
  eq(matchIcon('Graham crackers'), 'crackers')
  eq(matchIcon('Sliced honey ham'), 'ham-slices', 'and does fire when it is the word')
})

Deno.test('a flavour word does not beat the food it is written on', () => {
  eq(matchIcon('UHT Full Cream Milk'), 'milk-carton')
  eq(matchIcon('Sour cream'), 'cream-tub', 'still wins when it is the food')
  eq(matchIcon('Mango yogurt'), 'yogurt')
  eq(matchIcon('Caramel latte'), 'coffee')
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

// Composition tables write "Head, qualifier, qualifier", and scanning the whole
// string lets a qualifier win on length alone.
Deno.test('a form declared first wins over what qualifies it', () => {
  eq(matchIcon('Soup, vegetable chicken, canned'), 'soup-bowl')
  eq(matchIcon('Cookie, vanilla sandwich, reduced fat'), 'biscuit-stack')
  eq(matchIcon('Pastry, made with bean paste and salted egg yolk'), 'pie-slice')
  eq(matchIcon('Pickles, cucumber, dill'), 'pickles')
})

// The restriction that makes the rule above safe. A head noun does not always
// outrank what follows it: preferring it everywhere turned 401 steaks into
// slices, because "beef" is an ingredient the rest of the name refines where a
// soup is a shape the drawing is about.
Deno.test('an ingredient head does not outrank its own qualifier', () => {
  eq(matchIcon('Beef, round, bottom round, steak, separable lean'), 'beef-steak')
  eq(matchIcon('Beef, chuck, arm pot roast, boneless'), 'beef-slices')
})

Deno.test('a longer compound beats a longer single word', () => {
  eq(matchIcon('Chocolate chips'), 'chocolate-bar', 'not a crisp')
  eq(matchIcon('Valmer sandwich biscuits'), 'biscuit-stack', 'not a sandwich')
  eq(matchIcon('Oyster Sauce'), 'sauce-bottle', 'not an oyster')
  eq(matchIcon('Grapefruit juice, 100%'), 'fruit-juice', 'the fruit is the flavour')
  eq(matchIcon('Pur beurre de cacahuete'), 'peanuts', 'French peanut butter')
  eq(matchIcon('Veritable petit beurre'), 'biscuit-stack', 'a petit-beurre is a biscuit')
})

// A weak phrase is only weak by being partitioned out of the same key list, so
// one that is not a key does nothing at all and says nothing about it. `sesame`
// sat here inert after its drawing turned out to be beans and was renamed.
Deno.test('every weak phrase is a real table entry', () => {
  for (const phrase of WEAK_PHRASES) {
    if (!(phrase in TABLE)) throw new Error(`"${phrase}" is weak but maps to nothing`)
  }
})

// -- Names that are not written in Latin letters ---------------------------
//
// `normaliseName` drops everything outside `[a-z0-9]`, so a Thai or Japanese
// name reached `matchIcon` as the empty string and left on the first line.
// That was a third of every undrawn row in the catalogue, and it read as a
// missing vocabulary when it was a missing alphabet.

Deno.test('every script phrase names a drawing that exists', () => {
  const known = new Set<string>(Object.values(ICON_NAMES).flat())
  for (const [phrase, icon] of Object.entries(SCRIPT_TABLE)) {
    if (icon === null) continue
    if (!known.has(icon)) throw new Error(`"${phrase}" -> "${icon}", which is not a drawing`)
  }
})

Deno.test('a name in another script reaches a drawing', () => {
  eq(matchIcon('ข้าวผัดกุ้ง'), 'nasi-goreng', 'Thai fried rice')
  eq(matchIcon('นมจืด'), 'milk-carton', 'Thai plain milk')
  eq(matchIcon('牛乳 1L'), 'milk-carton', 'Japanese milk')
  eq(matchIcon('ポテトチップス うすしお'), 'potato-chips', 'Japanese crisps')
})

// With no spaces between words there is no boundary to stop a short phrase
// firing inside a longer one, so the ordering is doing all of the safety work.
Deno.test('the longer script phrase wins', () => {
  eq(matchIcon('มันฝรั่งแผ่นทอดกรอบ'), 'potato', 'potato, not the guava inside it')
  eq(matchIcon('มันฝรั่งทอดกรอบชนิดแผ่นหยัก'), 'potato-chips', 'and the crisp when it is contiguous')
  eq(matchIcon('หมากฝรั่งไม่มีน้ำตาล'), 'chewing-gum', 'gum, not guava')
  eq(matchIcon('เนสกาแฟโกลด์ คาปูชิโน'), 'coffee', 'cappuccino, not the crab inside it')
  eq(matchIcon('เนื้อปลาบดปรุงรสย่าง'), 'fish', 'fish flesh, not beef')
  eq(matchIcon('明治ミルクチョコレート'), 'chocolate-bar', 'milk chocolate is chocolate')
  eq(matchIcon('豆腐 絹'), 'tofu', 'tofu, not the bean inside it')
  eq(matchIcon('アイスコーヒー 微糖'), 'coffee', 'iced coffee is not an ice cream')
})

// `นม` (milk) is two characters and Thai runs its words together, so it turned
// up inside `กลิ่นมะลิ` (jasmine scent) and put a carton on a green tea.
Deno.test('a two-character phrase must start a word', () => {
  eq(matchIcon('ชาเขียว กลิ่นมะลิ สูตรไม่มีน้ำตาล'), 'tea-cup')
  eq(matchIcon('นมรสช็อกโกแลต'), 'milk-carton', 'and still fires where it does start one')
})

// The null value earns its keep here: `ขนม` (snack) CONTAINS `นม` (milk), and
// covers everything from a rusk to a peanut brittle. Stopping is the answer.
Deno.test('a script phrase can suppress a shorter one', () => {
  eq(matchIcon('ขนมขาไก่ รสเบคอน'), null)
  eq(matchIcon('ขนมปังโฮลวีต'), 'bread-loaf', 'but the bread compound still answers')
})

Deno.test('a Latin name never reaches the script table', () => {
  eq(matchIcon('KitKat Gold (Japan)'), null)
  eq(matchIcon('Nasi Lemak'), 'nasi-lemak')
  eq(matchIcon('Beef, round, steak'), 'beef-steak')
})
