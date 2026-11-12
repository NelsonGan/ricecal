import assert from 'node:assert/strict'
import test from 'node:test'
import { asTyped, ftsQuery, normalize, trigrams } from './text.ts'

test('splits a query into its distinct trigrams, spaces included', () => {
  assert.deepEqual(trigrams('nasi lemak'), ['nas', 'asi', 'si ', 'i l', ' le', 'lem', 'ema', 'mak'])
  assert.deepEqual(trigrams('aaaa'), ['aaa'])
})

test('a query shorter than a trigram has none', () => {
  assert.deepEqual(trigrams(''), [])
  assert.deepEqual(trigrams('ab'), [])
})

test('drops the words ftsQuery drops, unless nothing else is left', () => {
  // " of" and "wit" match thousands of dishes and name none of them.
  const grams = trigrams(normalize('a plate of nasi lemak with fried chicken'))
  for (const filler of [' of', 'of ', 'wit', 'pla']) assert.ok(!grams.includes(filler), filler)
  assert.ok(grams.includes('lem'))

  assert.deepEqual(trigrams('a bowl of food').slice(0, 3), ['a b', ' bo', 'bow'])
})

test('counts code points, so a character outside the BMP stays whole', () => {
  // CJK Extension B. Sliced as UTF-16 this made trigrams of half a character,
  // which are in no index.
  const grams = trigrams('\u{2070E}\u{2070E}\u{2070E}x')
  assert.deepEqual(grams, ['\u{2070E}\u{2070E}\u{2070E}', '\u{2070E}\u{2070E}x'])
  for (const g of grams) assert.equal(Array.from(g).length, 3)
})

test('caps how many trigrams one query can send', () => {
  const long = Array.from({ length: 90 }, (_, i) => String.fromCharCode(97 + (i % 26)) + i).join('')
  assert.equal(trigrams(long).length, 64)
})

test("drops the Pinyin keyboard's composing space, so a half-typed word still finds its dish", () => {
  // What the field reports while "pineapple" is still being composed on iOS's
  // Pinyin keyboard: the syllables it guesses, split by U+2006.
  const composing = 'pi\u2006ne\u2006a\u2006p\u2006p\u2006le'
  assert.equal(normalize(asTyped(composing)), 'pineapple')
  assert.equal(ftsQuery(asTyped(composing)), '"pineapple"')
  assert.ok(trigrams(normalize(asTyped('chi\u2006c\u2006ken'))).includes('ick'))
  // An ordinary space is still a word break.
  assert.equal(normalize(asTyped('white eg\u2006g')), 'white egg')
})
