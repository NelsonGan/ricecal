/**
 * One packet, one key.
 *
 * A single product carries up to four spellings of its code — UPC-E, EAN-8,
 * UPC-A, EAN-13 — and an American scanner drops the leading zero an EAN-13
 * carries. Zero-padding every spelling to fourteen digits makes them one key,
 * which is the only reason a scan on one phone finds a row written by another.
 *
 * THERE ARE THREE COPIES OF THIS RULE and that is deliberate, because the three
 * places that need it cannot reach each other cheaply:
 *
 *   `public.gtin14`                          in Postgres, for the client's own use
 *   this file                                the edge function, which must normalize
 *                                            before it can ask Open Food Facts anything
 *   `gtin14` in apps/catalogue-worker        the Worker, in front of D1, where the
 *                                            barcode IS the primary key
 *
 * Each is four lines and each is tested, because what they must not do is
 * drift. It lives in `_shared` rather than inside the `barcode` function so
 * that a test can import it without starting a server — `barcode/index.ts`
 * calls `Deno.serve` at the top level, so importing it from a test took the
 * whole test run down with it.
 *
 * The check digit is NOT validated, on purpose. Real packets and Open Food
 * Facts both carry codes that fail it, and a lookup that refuses to try is
 * worse than a miss.
 */
export function gtin14(code: string): string | null {
  const digits = (code ?? '').replace(/[^0-9]/g, '')
  if (digits.length < 8 || digits.length > 14) return null
  if (/^0+$/.test(digits)) return null
  return digits.padStart(14, '0')
}
