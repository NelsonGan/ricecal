import { isUserCancelled, yearlySavingPercent } from '../purchases'

/**
 * The saving badge, and the two failures the purchase screens must tell apart.
 *
 * Both are small and both are things a user reads or feels. A wrong percentage
 * sits on screen beside the two prices it claims to compare, which is the one
 * number on a paywall anybody can check. And a cancellation dressed up as an
 * error apologises for something the user did on purpose.
 */

describe('yearlySavingPercent', () => {
  it('compares the year against twelve months', () => {
    // The shipped pair: 4.90 x 12 = 58.80 against 29.90.
    expect(yearlySavingPercent(4.9, 29.9)).toBe(49)
  })

  it('gave 50% for the old pair, which is why it cannot be hardcoded', () => {
    // The badge said "SAVE 50%" and was true of 4.99/29.99. Repricing to
    // 4.90/29.90 made it false, and nothing would have caught that.
    expect(yearlySavingPercent(4.99, 29.99)).toBe(50)
  })

  it('says nothing when either price is missing', () => {
    expect(yearlySavingPercent(undefined, 29.9)).toBeUndefined()
    expect(yearlySavingPercent(4.9, undefined)).toBeUndefined()
    expect(yearlySavingPercent(undefined, undefined)).toBeUndefined()
  })

  it('says nothing rather than zero when a year saves nothing', () => {
    // Pricing a year at or above twelve months is a mistake somewhere, but the
    // paywall should show no badge rather than "SAVE 0%".
    expect(yearlySavingPercent(4.9, 58.8)).toBeUndefined()
    expect(yearlySavingPercent(4.9, 70)).toBeUndefined()
  })

  it('does not divide by a zero monthly price', () => {
    expect(yearlySavingPercent(0, 29.9)).toBeUndefined()
  })
})

describe('isUserCancelled', () => {
  it('recognises the store sheet being closed', () => {
    expect(isUserCancelled({ userCancelled: true })).toBe(true)
  })

  it('leaves every other failure to be reported', () => {
    // A declined card, a dropped connection and a plain Error all deserve a
    // message; only a deliberate dismissal does not.
    expect(isUserCancelled({ userCancelled: false })).toBe(false)
    expect(isUserCancelled(new Error('payment declined'))).toBe(false)
    expect(isUserCancelled(undefined)).toBe(false)
    expect(isUserCancelled(null)).toBe(false)
  })
})
