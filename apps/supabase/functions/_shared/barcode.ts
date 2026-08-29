/**
 * One packet, one key.
 *
 * A single product carries up to four spellings of its code, and an American
 * scanner drops the leading zero an EAN-13 carries. Zero-padding every spelling
 * to fourteen digits makes them one key, which is the only reason a scan on one
 * phone finds a row written by another.
 *
 * Three copies of the rule, deliberately, because the three places cannot reach
 * each other cheaply: `public.gtin14` in Postgres, this file for the edge
 * function, and `gtin14` in the catalogue Worker, where the barcode is the
 * primary key. Each is four lines and each is tested.
 *
 * In `_shared` rather than inside the `barcode` function, so a test can import it
 * without starting a server: `barcode/index.ts` calls `Deno.serve` at the top
 * level.
 *
 * The check digit is not validated: real packets and Open Food Facts both carry
 * codes that fail it, and a lookup that refuses to try is worse than a miss.
 */
export function gtin14(code: string): string | null {
  const digits = (code ?? '').replace(/[^0-9]/g, '')
  if (digits.length < 8 || digits.length > 14) return null
  if (/^0+$/.test(digits)) return null
  return digits.padStart(14, '0')
}
