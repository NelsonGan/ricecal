import { pannedRegion, pinchedRegion, pointFor } from '../components/MapGestures'

/** The arithmetic behind the iOS gesture layer that stands in for MapKit's own (react-native-maps#6052). */

const SIZE = { width: 400, height: 800 }
const REGION = { latitude: 3.14, longitude: 101.69, latitudeDelta: 0.08, longitudeDelta: 0.04 }

describe('pointFor', () => {
  it('puts the middle of the region in the middle of the view, and its corners at the corners', () => {
    const middle = pointFor(REGION, SIZE, REGION)
    expect(middle.x).toBeCloseTo(200)
    expect(middle.y).toBeCloseTo(400)
    const northWest = { latitude: 3.18, longitude: 101.67 }
    const at = pointFor(REGION, SIZE, northWest)
    expect(at.x).toBeCloseTo(0)
    expect(at.y).toBeCloseTo(0)
  })
})

describe('pannedRegion', () => {
  it('moves the map with the finger: a drag right shows what is to the west', () => {
    const moved = pannedRegion(REGION, SIZE, 200, 0)
    expect(moved.longitude).toBeCloseTo(101.67)
    expect(moved.latitude).toBe(REGION.latitude)
    // A drag down shows what is to the north.
    expect(pannedRegion(REGION, SIZE, 0, 400).latitude).toBeCloseTo(3.18)
  })

  it('never pans past the poles', () => {
    expect(pannedRegion({ ...REGION, latitude: 84 }, SIZE, 0, 80_000).latitude).toBe(85)
  })
})

describe('pinchedRegion', () => {
  it('spreading two fingers zooms in, pinching them zooms out, within bounds', () => {
    expect(pinchedRegion(REGION, 2).latitudeDelta).toBeCloseTo(0.04)
    expect(pinchedRegion(REGION, 0.5).longitudeDelta).toBeCloseTo(0.08)
    expect(pinchedRegion(REGION, 1000).latitudeDelta).toBe(0.0008)
    expect(pinchedRegion(REGION, 1).latitude).toBe(REGION.latitude)
  })
})
