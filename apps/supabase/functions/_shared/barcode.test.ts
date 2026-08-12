// The one piece of the barcode path worth testing without a network: the
// normalizer, which has to agree exactly with the two other copies of itself —
// `public.gtin14` in Postgres and `gtin14` in the catalogue Worker. See the
// header of `barcode.ts` for why there are three.
//
// These cases used to be shared with `tests/08_catalogue_search.test.sql`, so
// that changing one file failed the other. That file went with the catalogue
// when it moved to D1, and the Worker's copy has no test of its own — which is
// the one gap left in this arrangement.
//
//   deno test --no-lock --config functions/barcode/deno.json functions/_shared/barcode.test.ts

import { assertEquals } from 'jsr:@std/assert@^1'

import { gtin14 } from './barcode.ts'

Deno.test('an EAN-13 pads to 14', () => {
  assertEquals(gtin14('9556001110015'), '09556001110015')
})

Deno.test('a UPC-A pads to 14', () => {
  assertEquals(gtin14('012345678905'), '00012345678905')
})

Deno.test('UPC-A and the EAN-13 spelling of one product collapse', () => {
  // The whole reason the column is GTIN-14: an American scanner drops the
  // leading zero an EAN-13 carries, so one packet read on two devices produces
  // two strings.
  assertEquals(gtin14('012345678905'), gtin14('0012345678905'))
})

Deno.test('separators and spaces are not part of the code', () => {
  assertEquals(gtin14('9 556001 110015'), '09556001110015')
  assertEquals(gtin14('9556-0011-10015'), '09556001110015')
})

Deno.test('what is not a code', () => {
  assertEquals(gtin14('abc'), null)
  assertEquals(gtin14('12'), null)
  assertEquals(gtin14(''), null)
  assertEquals(gtin14('0000000000'), null)
  // Fifteen digits is not a GTIN in any symbology.
  assertEquals(gtin14('123456789012345'), null)
})

Deno.test('a bad check digit is still looked up', () => {
  // Deliberately not validated: Open Food Facts holds hundreds of thousands of
  // codes that fail the checksum and are nonetheless the code printed on a real
  // packet. Refusing those would be refusing the answer we have.
  assertEquals(gtin14('9556001110019'), '09556001110019')
})
