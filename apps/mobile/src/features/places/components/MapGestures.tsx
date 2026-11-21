import { type ReactNode, useRef } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import type MapViewType from 'react-native-maps'
import type { Camera } from 'react-native-maps'

/** A point of the map, in the view's own points. */
export type ScreenPoint = { x: number; y: number }

type LatLng = { latitude: number; longitude: number }

/** Degrees per point across and down the view, read off two corners MapKit converted. */
export type MapScale = { lngPerPoint: number; latPerPoint: number }

export function scaleFrom(
  topLeft: LatLng,
  bottomRight: LatLng,
  size: { width: number; height: number },
): MapScale {
  return {
    lngPerPoint: (bottomRight.longitude - topLeft.longitude) / Math.max(1, size.width),
    latPerPoint: (topLeft.latitude - bottomRight.latitude) / Math.max(1, size.height),
  }
}

/** Where a drag of (dx, dy) points moves `center` to: the map follows the finger. */
export function pannedCenter(center: LatLng, scale: MapScale, dx: number, dy: number): LatLng {
  return {
    longitude: center.longitude - dx * scale.lngPerPoint,
    latitude: Math.max(-85, Math.min(85, center.latitude + dy * scale.latPerPoint)),
  }
}

/** The camera height a pinch of `scale` makes of `altitude`, within MapKit's useful range. */
export function pinchedAltitude(altitude: number, scale: number): number {
  return Math.min(40_000_000, Math.max(150, altitude / Math.max(0.05, scale)))
}

/**
 * The map's gestures, done in JavaScript on iOS.
 *
 * On iOS 27 an Apple map from react-native-maps (1.29.11, the new
 * architecture) takes no pan, no pinch and, on a simulator, no tap either,
 * while Apple's own Maps app is fine: react-native-maps#6052, open with no
 * fix. Programmatic camera moves still work, so this layer sits over the map,
 * reads the gestures itself and moves the camera: a drag moves its centre with
 * the finger, a pinch changes its height, a double tap zooms in, and a tap is
 * handed back as a point for the screen to match against its own pins with
 * MapKit's `pointForCoordinate`.
 *
 * The camera rather than the region, because MapKit reports a region that is
 * not the view's shape, and setting it back made every drag zoom out a little.
 * The scale is read off MapKit's own conversion of two corners at touch down.
 *
 * Android's Google map takes its own gestures, so there this renders the map
 * alone. When react-native-maps ships a fix, delete this and pass `onPress` to
 * the markers again.
 */
export function MapGestures({
  mapRef,
  size,
  onTap,
  onGestureStart,
  children,
}: {
  mapRef: React.RefObject<MapViewType | null>
  size: { width: number; height: number }
  onTap: (point: ScreenPoint) => void
  /** A drag or a pinch began: the user is moving the map by hand. */
  onGestureStart?: () => void
  children: ReactNode
}) {
  /** The camera and scale at touch down, once MapKit has answered. */
  const start = useRef<{ camera: Camera; scale: MapScale } | null>(null)

  if (Platform.OS !== 'ios') return children

  const read = () => {
    const map = mapRef.current
    if (!map) return
    start.current = null
    void Promise.all([
      map.getCamera(),
      map.coordinateForPoint({ x: 0, y: 0 }),
      map.coordinateForPoint({ x: size.width, y: size.height }),
    ])
      .then(([camera, topLeft, bottomRight]) => {
        start.current = { camera, scale: scaleFrom(topLeft, bottomRight, size) }
      })
      .catch(() => undefined)
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(4)
    .onBegin(read)
    .onStart(() => onGestureStart?.())
    .onUpdate((event) => {
      const at = start.current
      if (!at) return
      mapRef.current?.setCamera({
        center: pannedCenter(at.camera.center, at.scale, event.translationX, event.translationY),
      })
    })

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(read)
    .onStart(() => onGestureStart?.())
    .onUpdate((event) => {
      const at = start.current
      if (!at?.camera.altitude) return
      mapRef.current?.setCamera({ altitude: pinchedAltitude(at.camera.altitude, event.scale) })
    })

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd(() => {
      void mapRef.current?.getCamera().then((camera) => {
        if (!camera.altitude) return
        mapRef.current?.animateCamera(
          { altitude: pinchedAltitude(camera.altitude, 2) },
          { duration: 250 },
        )
      })
    })

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => onTap({ x: event.x, y: event.y }))

  const gestures = Gesture.Simultaneous(pan, pinch, Gesture.Exclusive(doubleTap, tap))

  return (
    <View style={StyleSheet.absoluteFill}>
      {children}
      <GestureDetector gesture={gestures}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>
    </View>
  )
}

/**
 * The marker nearest a tap, within `reach` points of where it is drawn, using
 * MapKit's own projection. `lift` raises a marker's face above its spot (a pin
 * stands on it); a bubble is centred on its spot.
 */
export async function markerAt<T extends LatLng>(
  map: MapViewType | null,
  point: ScreenPoint,
  markers: readonly T[],
  { reach = 30, lift = () => 0 }: { reach?: number; lift?: (marker: T) => number } = {},
): Promise<T | null> {
  if (!map || markers.length === 0) return null
  const points = await Promise.all(
    markers.map((marker) =>
      map
        .pointForCoordinate({ latitude: marker.latitude, longitude: marker.longitude })
        .catch(() => null),
    ),
  )
  let best: { marker: T; distance: number } | null = null
  markers.forEach((marker, index) => {
    const at = points[index]
    if (!at) return
    const distance = Math.hypot(at.x - point.x, at.y - lift(marker) - point.y)
    if (distance <= reach && (!best || distance < best.distance)) best = { marker, distance }
  })
  return (best as { marker: T } | null)?.marker ?? null
}
