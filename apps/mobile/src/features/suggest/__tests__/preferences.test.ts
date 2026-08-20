import { createMMKV } from 'react-native-mmkv'

import { DEFAULT_CUISINES } from '../ask'
import {
  DEFAULT_PREFERENCES,
  MAX_CUISINES,
  readPreferences,
  saveCuisines,
  savePreferences,
} from '../preferences'

/**
 * What the ask sheet remembers between openings.
 *
 * The failures here are all quiet ones: a stale answer comes back as a dropdown
 * showing its placeholder while still sending the stale value, and a shared
 * store hands one account another's taste. Neither shows up as an error.
 */

const ALICE = 'user-alice'
const BOB = 'user-bob'

it('answers with the defaults before anything has been saved', () => {
  expect(readPreferences('nobody')).toEqual(DEFAULT_PREFERENCES)
})

it('starts on Malay, Chinese and Indian', () => {
  // The three a new account meets. Editable from the sheet, and stored nowhere
  // but this phone.
  expect(DEFAULT_PREFERENCES.cuisines).toEqual(['Malay', 'Chinese', 'Indian'])
  expect(DEFAULT_PREFERENCES.cuisine).toBe('Malay')
})

it('leans lighter until told otherwise', () => {
  // The version of the app somebody meets first is the one that leans the right
  // way; turning it off is a deliberate act.
  expect(DEFAULT_PREFERENCES.healthy).toBe(true)
})

it('gives back what was saved', () => {
  savePreferences(ALICE, {
    focus: 'protein',
    cuisine: 'Chinese',
    cuisines: ['Malay', 'Chinese'],
    healthy: false,
  })
  expect(readPreferences(ALICE)).toEqual({
    focus: 'protein',
    cuisine: 'Chinese',
    cuisines: ['Malay', 'Chinese'],
    healthy: false,
  })
})

it('keeps two accounts apart', () => {
  // A phone two people sign into in turn is every test device and plenty of
  // real ones.
  savePreferences(ALICE, {
    focus: 'carbs',
    cuisine: 'Nyonya',
    cuisines: ['Nyonya'],
    healthy: true,
  })
  savePreferences(BOB, {
    focus: 'protein',
    cuisine: 'Thai',
    cuisines: ['Thai'],
    healthy: false,
  })

  expect(readPreferences(ALICE).cuisine).toBe('Nyonya')
  expect(readPreferences(BOB).cuisine).toBe('Thai')
})

it('takes a kitchen nobody in this repo has heard of', () => {
  // The whole point of the list being the user's own: a fixed union could not
  // spell this.
  saveCuisines(ALICE, ['Malay', 'Nyonya', 'Japanese'])
  expect(readPreferences(ALICE).cuisines).toEqual(['Malay', 'Nyonya', 'Japanese'])
})

it('treats one kitchen spelled two ways as one kitchen', () => {
  // Two rows in a dropdown, one of which is unreachable, and a `key` collision
  // if the dedupe were on the exact string.
  saveCuisines(ALICE, ['Malay', 'malay', ' MALAY '])
  expect(readPreferences(ALICE).cuisines).toEqual(['Malay'])
})

it('never hands back an empty list', () => {
  // A dropdown with nothing in it is a control with no way out of itself, and
  // the question it answers still has to be answered.
  saveCuisines(ALICE, [])
  expect(readPreferences(ALICE).cuisines).toEqual([...DEFAULT_CUISINES])
})

it('bounds a list somebody could go on adding to', () => {
  saveCuisines(
    ALICE,
    Array.from({ length: MAX_CUISINES + 6 }, (_, index) => `Kitchen ${index}`),
  )
  expect(readPreferences(ALICE).cuisines).toHaveLength(MAX_CUISINES)
})

it('pulls a selected cuisine back onto the list it is chosen from', () => {
  // Storage outlives the build that wrote it, and this file has already changed
  // shape once: the cuisine was one of four keys and is now a word off a list.
  // A dropdown handed a value nothing matches draws as its placeholder while
  // still being what gets sent.
  savePreferences(ALICE, {
    focus: 'protein',
    cuisine: 'nyonya',
    cuisines: ['Malay', 'Chinese'],
    healthy: false,
  })

  expect(readPreferences(ALICE)).toEqual({
    focus: 'protein',
    cuisine: 'Malay',
    cuisines: ['Malay', 'Chinese'],
    healthy: false,
  })
})

it('upgrades a cuisine stored as one of the old four', () => {
  // A build before the list was editable wrote `malay`, and the list reads
  // "Malay". The same kitchen, and the LIST's spelling is the one the dropdown
  // compares against.
  savePreferences(ALICE, {
    focus: 'balanced',
    cuisine: 'malay',
    cuisines: [...DEFAULT_CUISINES],
    healthy: true,
  })

  expect(readPreferences(ALICE).cuisine).toBe('Malay')
})

it('survives a value that is not JSON at all', () => {
  // Half-written by a process that died, or written by a build that shaped this
  // differently. The defaults are a fine answer and there is nothing to report.
  // The mock keys its stores by id, so this reaches the same one the module has.
  createMMKV({ id: 'ricecal-suggest' }).set('answers:broken', 'not json {')

  expect(readPreferences('broken')).toEqual(DEFAULT_PREFERENCES)
})
