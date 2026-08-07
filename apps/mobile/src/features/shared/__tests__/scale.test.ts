import { axisNumber, axisTicks, niceCeiling } from '../scale'

describe('niceCeiling', () => {
  it('rounds up to a figure worth printing', () => {
    expect(niceCeiling(2140)).toBe(2400)
    expect(niceCeiling(8260)).toBe(10000)
    expect(niceCeiling(1150)).toBe(1200)
    expect(niceCeiling(7)).toBe(8)
  })

  it('leaves a peak that is already round where it is', () => {
    expect(niceCeiling(2000)).toBe(2000)
    expect(niceCeiling(8)).toBe(8)
  })

  it('halves into a figure with no more than one decimal', () => {
    // The whole point of the NICE list, and what the middle tick is drawn from:
    // a tick reading "1.3k" while standing for 1,250 is an axis that rounds its
    // own labels.
    for (const peak of [1, 37, 149, 2140, 8260, 99000]) {
      const half = niceCeiling(peak) / 2
      expect(half).toBe(Math.round(half * 10) / 10)
    }
  })

  it('answers something drawable for a chart with nothing in it', () => {
    expect(niceCeiling(0)).toBe(1)
    expect(niceCeiling(Number.NaN)).toBe(1)
  })
})

describe('axisNumber', () => {
  it('abbreviates thousands and drops a zero decimal', () => {
    expect(axisNumber(820)).toBe('820')
    expect(axisNumber(1200)).toBe('1.2k')
    expect(axisNumber(2000)).toBe('2k')
    expect(axisNumber(12500)).toBe('12.5k')
  })
})

describe('axisTicks', () => {
  it('runs top-first and never labels the baseline', () => {
    expect(axisTicks(2400)).toEqual([
      { at: 1, label: '2.4k' },
      { at: 0.5, label: '1.2k' },
    ])
  })

  it('takes a formatter, for the charts counting something other than energy', () => {
    expect(axisTicks(8, { divisions: 1, format: (value) => `${value} cups` })).toEqual([
      { at: 1, label: '8 cups' },
    ])
  })
})
