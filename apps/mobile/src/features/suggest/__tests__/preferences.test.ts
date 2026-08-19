import { createMMKV } from 'react-native-mmkv'

import { DEFAULT_PREFERENCES, readPreferences, savePreferences } from '../preferences'

/**
 * What the ask sheet remembers between openings.
 *
 * The failures here are all quiet ones: a stale answer comes back as a chip
 * nobody can see selected and a request the server refuses, and a shared store
 * hands one account another's taste. Neither shows up as an error.
 */

const ALICE = 'user-alice'
const BOB = 'user-bob'

it('answers with the defaults before anything has been saved', () => {
  expect(readPreferences('nobody')).toEqual(DEFAULT_PREFERENCES)
})

it('leans lighter until told otherwise', () => {
  // The version of the app somebody meets first is the one that leans the right
  // way; turning it off is a deliberate act.
  expect(DEFAULT_PREFERENCES.healthy).toBe(true)
})

it('gives back what was saved', () => {
  savePreferences(ALICE, { focus: 'protein', cuisine: 'chinese', healthy: false })
  expect(readPreferences(ALICE)).toEqual({
    focus: 'protein',
    cuisine: 'chinese',
    healthy: false,
  })
})

it('keeps two accounts apart', () => {
  // A phone two people sign into in turn is every test device and plenty of
  // real ones.
  savePreferences(ALICE, { focus: 'carbs', cuisine: 'mamak', healthy: true })
  savePreferences(BOB, { focus: 'protein', cuisine: 'others', healthy: false })

  expect(readPreferences(ALICE).cuisine).toBe('mamak')
  expect(readPreferences(BOB).cuisine).toBe('others')
})

it('drops an answer a later build no longer offers, and keeps the rest', () => {
  // Storage outlives the build that wrote it. A cuisine dropped from the list
  // would come back as a chip nobody can see selected and a request the server
  // refuses — and taking the whole row down with it would throw away two good
  // answers to fix one bad one.
  savePreferences(ALICE, {
    focus: 'protein',
    cuisine: 'nyonya' as never,
    healthy: false,
  })

  expect(readPreferences(ALICE)).toEqual({
    focus: 'protein',
    cuisine: DEFAULT_PREFERENCES.cuisine,
    healthy: false,
  })
})

it('survives a value that is not JSON at all', () => {
  // Half-written by a process that died, or written by a build that shaped this
  // differently. The defaults are a fine answer and there is nothing to report.
  // The mock keys its stores by id, so this reaches the same one the module has.
  createMMKV({ id: 'ricecal-suggest' }).set('answers:broken', 'not json {')

  expect(readPreferences('broken')).toEqual(DEFAULT_PREFERENCES)
})
