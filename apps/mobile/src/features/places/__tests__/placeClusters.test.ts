import {
  CLUSTER_MAX_ZOOM,
  createPlaceClusterer,
  longitudeDeltaForZoom,
  zoomForRegion,
} from '../lib/placeClusters'
import type { PlaceGroup } from '../lib/placeLocation'

/** The food map's bubbles: places that crowd at this zoom merge, and split as it closes in. */

function group(key: string, latitude: number, longitude: number, meals: number): PlaceGroup {
  return {
    key,
    name: key,
    address: null,
    category: null,
    latitude,
    longitude,
    kcal: meals * 500,
    entries: Array.from({ length: meals }, () => ({}) as PlaceGroup['entries'][number]),
  }
}

const KL = { latitude: 3.14, longitude: 101.69 }
const groups = [
  group('alor', 3.1455, 101.709, 3),
  group('lot10', 3.1458, 101.7127, 2),
  group('village', 3.1378, 101.6234, 4),
]

describe('createPlaceClusterer', () => {
  it('merges places that crowd at a city view and counts every meal under the bubble', () => {
    const markers = createPlaceClusterer(groups)(
      { ...KL, latitudeDelta: 0.15, longitudeDelta: 0.15 },
      400,
    )
    const bubble = markers.find((marker) => marker.kind === 'cluster')
    expect(bubble?.kind === 'cluster' && bubble.count).toBe(5)
    expect(markers.filter((marker) => marker.kind === 'place').map((m) => m.key)).toEqual([
      'village',
    ])
  })

  it('splits them apart at street level', () => {
    const markers = createPlaceClusterer(groups)(
      { latitude: 3.1456, longitude: 101.711, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      400,
    )
    expect(markers.every((marker) => marker.kind === 'place')).toBe(true)
  })

  it('keeps places at one exact point as one bubble that never splits', () => {
    const markers = createPlaceClusterer([group('a', 3.15, 101.7, 1), group('b', 3.15, 101.7, 2)])(
      { latitude: 3.15, longitude: 101.7, latitudeDelta: 0.001, longitudeDelta: 0.001 },
      400,
    )
    expect(markers).toHaveLength(1)
    const [only] = markers
    expect(only?.kind === 'cluster' && only.expansionZoom).toBe(CLUSTER_MAX_ZOOM + 1)
  })
})

describe('zoom arithmetic', () => {
  it('turns a longitude span into a zoom level and back', () => {
    const delta = longitudeDeltaForZoom(14, 400)
    expect(zoomForRegion({ ...KL, latitudeDelta: delta, longitudeDelta: delta }, 400)).toBeCloseTo(
      14,
    )
  })
})
