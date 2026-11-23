import type { LocatedEntry } from '@/data'
import {
  coverEntry,
  distanceMeters,
  formatDistance,
  groupByPlace,
  knownPlaces,
  nearFirst,
  placeKey,
  regionAround,
  regionFor,
  toEntryLocation,
} from '../lib/placeLocation'

/**
 * Meal locations' pure helpers: how a place becomes an entry's location, which
 * entries count as one place on the food map, and the picker's recent places.
 */

const VILLAGE_PARK = {
  latitude: 3.1377844,
  longitude: 101.6233956,
  name: 'Village Park Restaurant',
  address: '5, Jalan SS 21/37, Damansara Utama',
  placeId: 'ICE5698812969FAA0',
  category: 'Restaurant',
}
const ALI_MAMAK = { latitude: 3.1306, longitude: 101.6711, name: 'Ali Mamak' }

let nextId = 0
function entry(
  location: LocatedEntry['location'],
  {
    loggedAt = '2026-11-20T04:00:00.000Z',
    kcal = 500,
    photoPath,
    icon,
  }: Partial<{
    loggedAt: string
    kcal: number
    photoPath: string
    icon: LocatedEntry['icon']
  }> = {},
): LocatedEntry {
  nextId += 1
  return {
    id: `e${nextId}`,
    quantity: 1,
    loggedAt,
    logDate: loggedAt.slice(0, 10),
    source: 'search',
    foodName: 'Nasi lemak',
    place: 'hawker',
    servingLabel: 'plate',
    servingFactor: 1,
    macros: { kcal, carbs: 0, protein: 0, fat: 0 },
    base: { kcal, carbs: 0, protein: 0, fat: 0 },
    location,
    ...(photoPath ? { photoPath } : {}),
    ...(icon ? { icon } : {}),
  }
}

describe('toEntryLocation', () => {
  it('keeps the name, the address, the id and the category', () => {
    expect(
      toEntryLocation({
        id: 'I1',
        name: ' Village Park Restaurant ',
        address: ' Damansara Utama ',
        latitude: 3.1,
        longitude: 101.6,
        category: 'Restaurant',
      }),
    ).toEqual({
      latitude: 3.1,
      longitude: 101.6,
      name: 'Village Park Restaurant',
      address: 'Damansara Utama',
      placeId: 'I1',
      category: 'Restaurant',
    })
  })

  it('names an unnamed spot by its address and drops what is empty', () => {
    expect(
      toEntryLocation({
        id: null,
        name: '',
        address: 'Jalan Telawi 3',
        latitude: 3.1,
        longitude: 101.6,
        category: null,
      }),
    ).toEqual({
      latitude: 3.1,
      longitude: 101.6,
      name: 'Jalan Telawi 3',
      address: 'Jalan Telawi 3',
    })
  })
})

describe('distances', () => {
  it('measures the great circle and prints it the way a map app does', () => {
    const meters = distanceMeters(VILLAGE_PARK, ALI_MAMAK)
    expect(meters).toBeGreaterThan(5000)
    expect(meters).toBeLessThan(5500)
    expect(formatDistance(4, 'en')).toBe('10 m')
    expect(formatDistance(846, 'en')).toBe('850 m')
    expect(formatDistance(5312, 'en')).toBe('5.3 km')
    expect(formatDistance(12_400, 'en')).toBe('12 km')
    expect(formatDistance(Number.NaN, 'en')).toBe('')
  })
})

describe('placeKey', () => {
  it("is Apple's id when there is one, else the name at the point to about 11 m", () => {
    expect(placeKey({ id: 'I1', name: 'x', latitude: 0, longitude: 0 })).toBe('id:I1')
    const a = placeKey({ id: null, name: 'Gerai Ah Seng', latitude: 3.13771, longitude: 101.62341 })
    const b = placeKey({
      id: null,
      name: 'gerai ah seng ',
      latitude: 3.13774,
      longitude: 101.62338,
    })
    expect(a).toBe(b)
    expect(
      placeKey({ id: null, name: 'Next door', latitude: 3.13771, longitude: 101.62341 }),
    ).not.toBe(a)
  })
})

describe('knownPlaces and nearFirst', () => {
  const entries = [
    entry(VILLAGE_PARK, { loggedAt: '2026-11-18T04:00:00.000Z' }),
    entry(ALI_MAMAK, { loggedAt: '2026-11-20T12:00:00.000Z' }),
    entry(VILLAGE_PARK, { loggedAt: '2026-11-19T04:00:00.000Z' }),
  ]

  it('lists each place once, the most recent first', () => {
    expect(knownPlaces(entries).map((place) => place.name)).toEqual([
      'Ali Mamak',
      'Village Park Restaurant',
    ])
  })

  it('puts the ones around here first, closest first', () => {
    const near = { latitude: 3.1378, longitude: 101.6234 }
    expect(nearFirst(knownPlaces(entries), near, 3).map((place) => place.name)).toEqual([
      'Village Park Restaurant',
      'Ali Mamak',
    ])
  })
})

describe('groupByPlace', () => {
  it('adds up a place’s visits and calories, busiest place first', () => {
    const groups = groupByPlace([
      entry(ALI_MAMAK, { kcal: 300 }),
      entry(VILLAGE_PARK, { kcal: 600, loggedAt: '2026-11-01T04:00:00.000Z' }),
      entry(
        { ...VILLAGE_PARK, name: 'Village Park (renamed)' },
        {
          kcal: 400,
          loggedAt: '2026-11-19T04:00:00.000Z',
        },
      ),
    ])
    expect(groups.map((group) => [group.name, group.entries.length, group.kcal])).toEqual([
      // The newest visit names the place.
      ['Village Park (renamed)', 2, 1000],
      ['Ali Mamak', 1, 300],
    ])
  })
})

describe('coverEntry', () => {
  it('prefers a photo, then a drawing, then the newest', () => {
    const plain = entry(ALI_MAMAK)
    const drawn = entry(ALI_MAMAK, { icon: { set: 'food', name: 'coffee' } })
    const photographed = entry(ALI_MAMAK, { photoPath: 'meals/u/1.jpg' })
    expect(coverEntry([plain, drawn, photographed])).toBe(photographed)
    expect(coverEntry([plain, drawn])).toBe(drawn)
    expect(coverEntry([plain])).toBe(plain)
  })
})

describe('regionFor', () => {
  it('frames the points with padding, and one point at a fixed zoom', () => {
    expect(regionFor([])).toBeNull()
    expect(regionFor([VILLAGE_PARK], { minDelta: 0.02 })).toEqual({
      latitude: VILLAGE_PARK.latitude,
      longitude: VILLAGE_PARK.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    })
    const both = regionFor([VILLAGE_PARK, ALI_MAMAK], { padding: 2 })
    expect(both?.longitudeDelta).toBeCloseTo((ALI_MAMAK.longitude - VILLAGE_PARK.longitude) * 2)
  })
})

// A cluster's zoom on a world-wide map asked `regionAround` for 200° and MapKit
// raised, closing the app; a first frame from New Zealand to Iceland reached
// past the north pole.
describe('regions MapKit takes', () => {
  const valid = (r: { latitude: number; latitudeDelta: number; longitudeDelta: number }) => {
    expect(r.latitudeDelta).toBeLessThanOrEqual(180)
    expect(r.longitudeDelta).toBeLessThanOrEqual(360)
    expect(Math.abs(r.latitude) + r.latitudeDelta / 2).toBeLessThanOrEqual(90)
  }
  it('caps a zoom wider than the globe', () => {
    valid(regionAround({ latitude: 3.15, longitude: 101.7 }, 200))
  })
  it('keeps a first frame between the poles', () => {
    const framed = regionFor(
      [
        { latitude: -40, longitude: 175 },
        { latitude: 65, longitude: -21 },
      ],
      { padding: 1.5 },
    )
    expect(framed).not.toBeNull()
    if (framed) valid(framed)
  })
})
