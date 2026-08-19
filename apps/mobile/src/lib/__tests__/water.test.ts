import { volume, waterProgress } from '../water'

/**
 * How a volume prints, and how full the glass is.
 *
 * Both are arithmetic behind a picture, which is exactly the shape that goes
 * wrong quietly: a glass drawn at 130% overflows its own outline and nobody
 * files it as a bug, and "2.0 L" beside "1.8 L" reads as a precision this app
 * does not have. Neither shows up in a typecheck.
 */

describe('volume', () => {
  it('stays in millilitres below a litre', () => {
    expect(volume(0)).toEqual({ value: '0', unit: 'ml' })
    expect(volume(250)).toEqual({ value: '250', unit: 'ml' })
    expect(volume(999)).toEqual({ value: '999', unit: 'ml' })
  })

  it('turns over to litres at one', () => {
    expect(volume(1000)).toEqual({ value: '1', unit: 'l' })
    expect(volume(1500)).toEqual({ value: '1.5', unit: 'l' })
    expect(volume(2750)).toEqual({ value: '2.8', unit: 'l' })
  })

  // A trailing zero claims a precision that is not there: 2,000 ml is "2 L" and
  // never "2.0 L", while 1,500 keeps the decimal because it is saying something.
  it('drops a decimal that says nothing', () => {
    expect(volume(2000).value).toBe('2')
    expect(volume(3000).value).toBe('3')
    expect(volume(1050).value).toBe('1.1')
  })

  it('rounds a fractional millilitre away before deciding the unit', () => {
    // A daily average comes back from Postgres as a numeric, so this is a real
    // input rather than a defensive one.
    expect(volume(999.6)).toEqual({ value: '1', unit: 'l' })
    expect(volume(249.4)).toEqual({ value: '249', unit: 'ml' })
  })
})

describe('waterProgress', () => {
  it('is the fraction of the goal', () => {
    expect(waterProgress(500, 2000)).toBe(0.25)
    expect(waterProgress(2000, 2000)).toBe(1)
  })

  // Drinking past the goal is not an error and nothing colours it as one, but
  // the glass has nowhere to put the extra.
  it('is bounded at a full glass', () => {
    expect(waterProgress(4000, 2000)).toBe(1)
  })

  // A goal is never zero in the database — the column checks 250..8000 — but the
  // fallback path reads a summary that can carry one, and dividing by it would
  // put `Infinity` into a style.
  it('answers empty for a goal of nothing', () => {
    expect(waterProgress(500, 0)).toBe(0)
    expect(waterProgress(-100, 2000)).toBe(0)
  })
})
