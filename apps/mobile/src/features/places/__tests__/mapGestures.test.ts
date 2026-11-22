import { pannedCenter, pinchedAltitude, scaleFrom } from '../components/MapGestures'

/** The arithmetic behind the iOS gesture layer that stands in for MapKit's own (react-native-maps#6052). */

const SIZE = { width: 400, height: 800 }
const SCALE = scaleFrom(
  { latitude: 3.18, longitude: 101.67 },
  { latitude: 3.1, longitude: 101.71 },
  SIZE,
)
const KL = { latitude: 3.14, longitude: 101.69 }

describe('scaleFrom', () => {
  it('reads degrees per point off two corners', () => {
    expect(SCALE.lngPerPoint).toBeCloseTo(0.0001)
    expect(SCALE.latPerPoint).toBeCloseTo(0.0001)
  })

  it('normalises longitude span across the antimeridian', () => {
    const across = scaleFrom(
      { latitude: 10, longitude: 179 },
      { latitude: 8, longitude: -179 },
      { width: 200, height: 200 },
    )
    expect(across.lngPerPoint).toBeCloseTo(0.01)
  })
})

describe('pannedCenter', () => {
  it('moves the map with the finger: a drag right shows what is to the west, down what is north', () => {
    expect(pannedCenter(KL, SCALE, 200, 0).longitude).toBeCloseTo(101.67)
    expect(pannedCenter(KL, SCALE, 0, 400).latitude).toBeCloseTo(3.18)
  })

  it('never pans past the poles and wraps longitude into [-180, 180]', () => {
    expect(pannedCenter({ ...KL, latitude: 84 }, SCALE, 0, 80_000).latitude).toBe(85)
    expect(
      pannedCenter({ latitude: 0, longitude: 179 }, { lngPerPoint: 1, latPerPoint: 1 }, -2, 0)
        .longitude,
    ).toBeCloseTo(-179)
  })
})

describe('pinchedAltitude', () => {
  it('spreading two fingers comes closer, pinching them goes higher, within bounds', () => {
    expect(pinchedAltitude(10_000, 2)).toBe(5_000)
    expect(pinchedAltitude(10_000, 0.5)).toBe(20_000)
    expect(pinchedAltitude(10_000, 1000)).toBe(150)
  })
})
