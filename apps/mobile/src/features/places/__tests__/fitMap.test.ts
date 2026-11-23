import { Platform } from 'react-native'

import { fitMapToPoints } from '../lib/fitMap'

type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }

const KUALA_LUMPUR = { latitude: 3.1478, longitude: 101.6953 }
const LONDON = { latitude: 51.5074, longitude: -0.1278 }
const AUCKLAND = { latitude: -36.8485, longitude: 174.7633 }
const REYKJAVIK = { latitude: 64.1466, longitude: -21.9426 }

/** The food map's own numbers on an iPhone 18 Pro. */
const FIT = {
  minDelta: 0.02,
  margin: { top: 48, right: 64, bottom: 32, left: 64 },
  mapPadding: { top: 126, right: 0, bottom: 254, left: 0 },
  animated: true,
  size: { width: 402, height: 874 },
}

const map = { fitToCoordinates: jest.fn() }

function fitted(points: { latitude: number; longitude: number }[]): Region {
  const moveTo = jest.fn()
  fitMapToPoints(map, points, moveTo, FIT)
  expect(moveTo).toHaveBeenCalledTimes(1)
  return moveTo.mock.calls[0][0] as Region
}

/** What `-[MKMapView setRegion:]` accepts; anything else raises and kills the app. */
function expectValid(region: Region) {
  expect(Number.isFinite(region.latitudeDelta)).toBe(true)
  expect(Number.isFinite(region.longitudeDelta)).toBe(true)
  expect(region.latitudeDelta).toBeGreaterThan(0)
  expect(region.latitudeDelta).toBeLessThanOrEqual(180)
  expect(region.longitudeDelta).toBeGreaterThan(0)
  expect(region.longitudeDelta).toBeLessThanOrEqual(360)
  expect(Math.abs(region.latitude)).toBeLessThanOrEqual(90)
  expect(Math.abs(region.longitude)).toBeLessThanOrEqual(180)
}

beforeAll(() => {
  Platform.OS = 'ios'
})

// MapKit raised "Invalid Region <span:+405.85, +330.27>" and the app closed:
// the iOS fit scaled the places' box to the screen's height with no ceiling,
// so a lunch in London beside the rest in Kuala Lumpur asked for more than
// the whole globe.
it('frames places on two continents without asking for more than the globe', () => {
  const region = fitted([KUALA_LUMPUR, LONDON])
  expectValid(region)
  // And still spans both of them east to west.
  for (const place of [KUALA_LUMPUR, LONDON]) {
    expect(Math.abs(place.longitude - region.longitude)).toBeLessThan(region.longitudeDelta / 2)
  }
  expectValid(fitted([KUALA_LUMPUR, AUCKLAND, REYKJAVIK]))
})

it('still frames one city as before', () => {
  const region = fitted([KUALA_LUMPUR, { latitude: 3.1579, longitude: 101.7123 }])
  expectValid(region)
  // A few hundred metres of places: a street-level view, not a country.
  expect(region.longitudeDelta).toBeLessThan(0.1)
  expect(region.latitude).toBeGreaterThan(3.1)
  expect(region.latitude).toBeLessThan(3.16)
})
