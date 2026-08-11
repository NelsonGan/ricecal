import { PHOTO_CROP, photoCropFill } from '../photo'

/**
 * The geometry rather than the number: what matters is that the box overhangs
 * its parent by the crop and is centred while doing it, since that is what
 * makes the camera preview and the drawn photo the same frame.
 */
describe('photoCropFill', () => {
  const percent = (value: string) => Number(value.replace('%', ''))

  it('overhangs the parent by the crop on both axes', () => {
    expect(percent(photoCropFill.width)).toBeCloseTo(PHOTO_CROP * 100)
    expect(percent(photoCropFill.height)).toBeCloseTo(PHOTO_CROP * 100)
  })

  it('pulls back half the overhang, so the middle is the middle', () => {
    expect(percent(photoCropFill.left)).toBeCloseTo(-(PHOTO_CROP * 100 - 100) / 2)
    expect(percent(photoCropFill.left)).toBe(percent(photoCropFill.top))
  })

  // Percentages go through `Math.round` because `1.15 * 100` is 114.99999…,
  // and a width of "114.99999999999999%" is a rounding artefact in a style
  // sheet rather than a measurement.
  it('states its percentages to no more than two decimals', () => {
    for (const value of [photoCropFill.width, photoCropFill.height, photoCropFill.left]) {
      expect(value).toMatch(/^-?\d+(\.\d{1,2})?%$/)
    }
  })

  it('crops in rather than out', () => {
    expect(PHOTO_CROP).toBeGreaterThan(1)
  })
})
