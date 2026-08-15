/**
 * How text is folded before it is compared, in one place.
 *
 * Both ends of every comparison have to agree: a query normalized one way and a
 * column normalized another is a row nobody can find. That makes this the one
 * module in the catalogue that genuinely cannot be allowed to have two copies —
 * so the loader in `apps/supabase/scripts` imports THIS file rather than
 * reimplementing it, which Node can do because it strips types on the way in.
 *
 * The alternative was a fourth handwritten copy of `normalize` sitting next to
 * the payloads, agreeing with this one until the day somebody widened a
 * character class in one of them.
 */

/** The echo of what `public.search_normalize` did in Postgres. */
export function normalize(text: string): string {
  return (text ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Any barcode spelling as a GTIN-14.
 *
 * One packet carries up to four spellings — UPC-E, EAN-8, UPC-A, EAN-13 — and
 * an American scanner drops the leading zero an EAN-13 carries. Padding every
 * spelling to fourteen digits makes them one key.
 *
 * The check digit is deliberately NOT validated: real packets and Open Food
 * Facts both carry codes that fail it, and a lookup that refuses to try is
 * worse than a miss. Kept in step with `_shared/barcode.ts` on the Supabase
 * side and `public.gtin14` in the diary's Postgres; see the header of the first
 * of those for why three copies is the right number.
 */
export function gtin14(code: string): string | null {
  const digits = (code ?? '').replace(/[^0-9]/g, '')
  if (digits.length < 8 || digits.length > 14) return null
  if (/^0+$/.test(digits)) return null
  return digits.padStart(14, '0')
}

/** Terms that cannot distinguish a food; the same list `search_tsquery` used. */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'with',
  'and',
  'or',
  'in',
  'on',
  'at',
  'to',
  'for',
  'some',
  'this',
  'that',
  'it',
  'is',
  'are',
  'plus',
  'served',
  'side',
  'plate',
  'bowl',
  'cup',
  'glass',
  'serving',
  'portion',
  'piece',
  'pieces',
  'order',
  'dish',
  'meal',
  'food',
])

/**
 * FTS5 is a query language, so anything a person types has to be quoted before
 * it reaches it. A bare apostrophe, a hyphen, or the word `OR` would otherwise
 * be read as syntax — and "chicken OR rice" typed by a person means neither.
 */
export function quote(term: string): string {
  return `"${term.replace(/"/g, '""')}"`
}

// Belt-and-braces caps on how wide a single query's MATCH expression can get.
// The caller already bounds the input length, so these are rarely the binding
// limit; they exist so a query near the length cap still cannot OR together an
// unreasonable number of arms, each of which is its own index scan.
const MAX_FTS_TERMS = 24
const MAX_TRIGRAMS = 64

export function ftsQuery(q: string): string | null {
  const terms = normalize(q)
    .split(' ')
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .slice(0, MAX_FTS_TERMS)
  return terms.length ? terms.map(quote).join(' OR ') : null
}

/**
 * The query as an OR of its own overlapping trigrams.
 *
 * The fuzzy arm, and the one thing that needed rebuilding rather than porting.
 * `pg_trgm` scored SIMILARITY; FTS5's trigram tokenizer only matches
 * substrings, and a misspelling is by definition not a substring of the right
 * spelling — "nasi lemk" is not inside "nasi lemak". Splitting the query into
 * trigrams and letting bm25 rank by how many of them a row shares reconstructs
 * similarity out of the primitive that does exist.
 */
export function trigramQuery(qn: string): string | null {
  if (qn.length < 3) return null
  const grams = new Set<string>()
  for (let i = 0; i <= qn.length - 3; i++) grams.add(qn.slice(i, i + 3))
  const usable = [...grams].filter((g) => g.trim().length > 0).slice(0, MAX_TRIGRAMS)
  return usable.length ? usable.map(quote).join(' OR ') : null
}
