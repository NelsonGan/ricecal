import { Platform } from 'react-native'
import type { EdgePadding, Region } from 'react-native-maps'

/** The two camera calls a fit needs (react-native-maps' MapView has both). */
interface FittableMap {
  animateToRegion(region: Region, duration?: number): void
  fitToCoordinates(
    coordinates: { latitude: number; longitude: number }[],
    options?: { edgePadding?: EdgePadding; animated?: boolean },
  ): void
}

const NO_PADDING: EdgePadding = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * Frames `points` on `map`: their bounds with `margin` around them, inside the
 * map's own `mapPadding`. Points that all sit on one spot (a single place, or
 * stalls in one food court) get a fixed `minDelta` view
 * instead, since a box of no size would zoom to street level.
 */
export function fitMapToPoints(
  map: FittableMap | null,
  points: readonly { latitude: number; longitude: number }[],
  {
    minDelta,
    margin,
    mapPadding = NO_PADDING,
    animated,
    size,
  }: {
    minDelta: number
    margin: EdgePadding
    mapPadding?: EdgePadding
    animated: boolean
    /** The map's size in points, which the iOS fit needs. */
    size?: { width: number; height: number }
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
    map.animateToRegion(
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
  if (Platform.OS === 'ios' && size) {
    // MapKit on iOS 27 answers `fitToCoordinates` with a view many times too
    // wide (alongside react-native-maps#6052), so the region is worked out
    // here. MapKit already fits a region into the band `mapPadding` leaves
    // open, so the region is sized for that band and only the margins pad it.
    const open = {
      width: size.width - mapPadding.left - mapPadding.right,
      height: size.height - mapPadding.top - mapPadding.bottom,
    }
    map.animateToRegion(paddedRegion(points, open, margin), animated ? 350 : 0)
    return
  }
  // Google Maps adds edgePadding to the map's own padding.
  const edgePadding =
    Platform.OS === 'android'
      ? margin
      : {
          top: margin.top + mapPadding.top,
          right: margin.right + mapPadding.right,
          bottom: margin.bottom + mapPadding.bottom,
          left: margin.left + mapPadding.left,
        }
  map.fitToCoordinates([...points], { edgePadding, animated })
}

/**
 * The region that shows `points` inside a view of `size` with `padding` left
 * clear on each side: their box scaled up to the whole view, centred on the
 * open band rather than the view. Degrees per point are taken as equal both
 * ways, which is close enough at the latitudes anybody eats at for a frame.
 */
export function paddedRegion(
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
  const perPoint = Math.max((east - west) / openWidth, (north - south) / openHeight, 1e-6)
  const latitudeDelta = perPoint * size.height
  const longitudeDelta = perPoint * size.width
  // The open band's middle is this many points below the view's middle.
  const below = (padding.top - padding.bottom) / 2
  const right = (padding.left - padding.right) / 2
  return {
    latitude: (north + south) / 2 + below * perPoint,
    longitude: (east + west) / 2 - right * perPoint,
    latitudeDelta,
    longitudeDelta,
  }
}
