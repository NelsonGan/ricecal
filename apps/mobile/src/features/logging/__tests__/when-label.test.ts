import { whenLabel } from '../when'

/**
 * When a meal in "My foods" was last eaten.
 *
 * Named days rather than elapsed hours, and that is the part worth pinning: a
 * meal at 11pm last night is nine hours ago AND yesterday, and only one of those
 * is the word somebody scanning their own diary is looking for. Getting it wrong
 * reads as the app being confused about what day it is.
 */

const named = { today: 'Today', yesterday: 'Yesterday' }

/** Local time on a given day, since the label is about the reader's calendar. */
const at = (daysAgo: number, hour: number, minute = 0) => {
  const when = new Date()
  when.setDate(when.getDate() - daysAgo)
  when.setHours(hour, minute, 0, 0)
  return when.toISOString()
}

it('names today', () => {
  expect(whenLabel(at(0, 8, 20), named)).toBe('Today, 8:20 am')
})

it('names yesterday, even a few hours ago', () => {
  // 11pm last night is inside the "a few hours" window and is still yesterday.
  expect(whenLabel(at(1, 23, 15), named)).toBe('Yesterday, 11:15 pm')
})

it('gives anything older a date', () => {
  const label = whenLabel(at(9, 13, 5), named)
  expect(label).not.toContain('Today')
  expect(label).not.toContain('Yesterday')
  expect(label).toMatch(/, 1:05 pm$/)
})

it('writes noon and midnight as twelve rather than zero', () => {
  expect(whenLabel(at(0, 12, 0), named)).toBe('Today, 12:00 pm')
  expect(whenLabel(at(0, 0, 30), named)).toBe('Today, 12:30 am')
})
