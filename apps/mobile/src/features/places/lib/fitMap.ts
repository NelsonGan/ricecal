import { Platform } from 'react-native'
import type { EdgePadding, Region } from 'react-native-maps'

/** The widest region MapKit takes, a little inside its own limits. */
const MAX_LATITUDE_DELTA = 170
const MAX_LONGITUDE_DELTA = 359

/** The camera call a fit needs beside `moveTo` (react-native-maps' MapView has it). */
interface FittableMap {
  fitToCoordinates(
    coordinates: { latitude: number; longitude: number }[],
    options?: { edgePadding?: EdgePadding; animated?: boolean },
  ): void
}

/**
 * Frames `points` on `map`: their bounds with `margin` around them, inside the
 * map's own `mapPadding`. Points that all sit on one spot (a single place, or
 * stalls in one food court) get a fixed `minDelta` view
 * instead, since a box of no size would zoom to street level. A fit to a
 * region goes through the caller's `moveTo`, which animates the map there and
 * records where it went.
 */
export function fitMapToPoints(
  map: FittableMap | null,
  points: readonly { latitude: number; longitude: number }[],
  moveTo: (region: Region, duration: number) => void,
  {
    minDelta,
    margin,
    mapPadding,
    animated,
    size,
  }: {
    minDelta: number
    margin: EdgePadding
    mapPadding: EdgePadding
    animated: boolean
    /** The map's size in points, which the iOS fit needs. */
    size: { width: number; height: number }
  },
): void {
  const first = points[0]
  if (!map || !first) return
  const onOneSpot = points.every(
    (point) =>
      Math.abs(point.latitude - first.latitude) < minDelta / 10 &&
      Math.abs(point.longitude - first.longitude) < minDelta / 10,
  )
  if (onOneSpot) {
    moveTo(
      {
        latitude: first.latitude,
        longitude: first.longitude,
        latitudeDelta: minDelta,
        longitudeDelta: minDelta,
      },
      animated ? 350 : 0,
    )
    return
  }
  if (Platform.OS === 'ios') {
    // MapKit on iOS 27 answers `fitToCoordinates` with a view many times too
    // wide (alongside react-native-maps#6052), so the region is worked out
    // here. MapKit already fits a region into the band `mapPadding` leaves
    // open, so the region is sized for that band and only the margins pad it.
    const open = {
      width: size.width - mapPadding.left - mapPadding.right,
      height: size.height - mapPadding.top - mapPadding.bottom,
    }
    moveTo(paddedRegion(points, open, margin), animated ? 350 : 0)
    return
  }
  // Google Maps adds edgePadding to the map's own padding.
  map.fitToCoordinates([...points], { edgePadding: margin, animated })
}

/**
 * The region that shows `points` inside a view of `size` with `padding` left
 * clear on each side: their box scaled up to the whole view, centred on the
 * open band rather than the view. Degrees per point are taken as equal both
 * ways, which is close enough at the latitudes anybody eats at for a frame.
 */
function paddedRegion(
  points: readonly { latitude: number; longitude: number }[],
  size: { width: number; height: number },
  padding: EdgePadding,
): Region {
  const lats = points.map((point) => point.latitude)
  const lngs = points.map((point) => point.longitude)
  const [south, north] = [Math.min(...lats), Math.max(...lats)]
  const [west, east] = [Math.min(...lngs), Math.max(...lngs)]
  const openWidth = Math.max(40, size.width - padding.left - padding.right)
  const openHeight = Math.max(40, size.height - padding.top - padding.bottom)
  // One scale for both axes: whichever of the box's sides needs more room.
  const perLatitude = (north - south) / openHeight
  const perPoint = Math.max((east - west) / openWidth, perLatitude, 1e-6)
  // But never more than the globe. MapKit raises on a span past 180° of
  // latitude or 360° of longitude, and the raise closed the app: a lunch in
  // London beside the rest in Kuala Lumpur asked for 184° once the east-west
  // scale was applied to a tall screen. Past the cap only the latitude the
  // places need is asked for, and MapKit widens it to the screen, as it does
  // for any region; a span reaching for a pole is endless on its projection.
  const scaled = perPoint * size.height
  const latitudeDelta =
    scaled <= MAX_LATITUDE_DELTA
      ? scaled
      : Math.min(MAX_LATITUDE_DELTA, Math.max(perLatitude * size.height, 1e-6))
  const longitudeDelta = Math.min(MAX_LONGITUDE_DELTA, perPoint * size.width)
  // The open band's middle is this many points below the view's middle.
  const below = (padding.top - padding.bottom) / 2
  const right = (padding.left - padding.right) / 2
  // A middle that keeps the whole span between the poles and on one turn of
  // the globe, which a world-wide frame shifted for the panel did not.
  const reach = 90 - latitudeDelta / 2
  const latitude = Math.max(-reach, Math.min(reach, (north + south) / 2 + below * perPoint))
  const longitude = (((east + west) / 2 - right * perPoint + 540) % 360) - 180
  return { latitude, longitude, latitudeDelta, longitudeDelta }
}
