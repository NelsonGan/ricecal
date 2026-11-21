import {
  answerLocationsOffer,
  autoTagEnabled,
  locationsEnabled,
  locationsOfferDue as offerDue,
  recordMealForLocationsOffer,
  setAutoTag,
  setLocationsEnabled,
} from '../preference'

/**
 * The Locations switches and the one-time offer, per phone and per account.
 * The store lives for the whole file, so each test takes accounts of its own.
 */
let n = 0
let a = ''
let b = ''
beforeEach(() => {
  n += 1
  a = `a${n}`
  b = `b${n}`
})

describe('Locations switches', () => {
  it('starts off, with Auto-tag on for when it is turned on', () => {
    expect(locationsEnabled(a)).toBe(false)
    expect(autoTagEnabled(a)).toBe(true)
  })

  it('keeps each account on the phone apart', () => {
    setLocationsEnabled(a, true)
    setAutoTag(a, false)
    expect(locationsEnabled(a)).toBe(true)
    expect(autoTagEnabled(a)).toBe(false)
    expect(locationsEnabled(b)).toBe(false)
    expect(autoTagEnabled(b)).toBe(true)
  })
})

describe('the offer', () => {
  it('falls due on a meal logged while Locations is off', () => {
    recordMealForLocationsOffer(a)
    expect(offerDue(a)).toBe(true)
  })

  it('is asked once: answered, a later meal never brings it back', () => {
    recordMealForLocationsOffer(a)
    answerLocationsOffer(a)
    recordMealForLocationsOffer(a)
    expect(offerDue(a)).toBe(false)
  })

  it('never falls due once Locations is on, and turning it on answers it', () => {
    setLocationsEnabled(a, true)
    recordMealForLocationsOffer(a)
    expect(offerDue(a)).toBe(false)
    setLocationsEnabled(a, false)
    recordMealForLocationsOffer(a)
    expect(offerDue(a)).toBe(false)
  })
})
