import { type ReactNode, useRef } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import type MapViewType from 'react-native-maps'
import type { Region } from 'react-native-maps'

/** A point of the map, in the view's own points. */
export type ScreenPoint = { x: number; y: number }

/** Where a coordinate sits in a view showing `region`, by linear projection. */
export function pointFor(
  region: Region,
  size: { width: number; height: number },
  coordinate: { latitude: number; longitude: number },
): ScreenPoint {
  const west = region.longitude - region.longitudeDelta / 2
  const north = region.latitude + region.latitudeDelta / 2
  return {
    x: ((coordinate.longitude - west) / region.longitudeDelta) * size.width,
    y: ((north - coordinate.latitude) / region.latitudeDelta) * size.height,
  }
}

/** The region a drag of (dx, dy) points moves `start` to: the map follows the finger. */
export function pannedRegion(
  start: Region,
  size: { width: number; height: number },
  dx: number,
  dy: number,
): Region {
  return {
    ...start,
    longitude: start.longitude - (dx / Math.max(1, size.width)) * start.longitudeDelta,
    latitude: Math.max(
      -85,
      Math.min(85, start.latitude + (dy / Math.max(1, size.height)) * start.latitudeDelta),
    ),
  }
}

/** The region a pinch of `scale` makes of `start`, about its middle. */
export function pinchedRegion(start: Region, scale: number): Region {
  const factor = 1 / Math.max(0.05, scale)
  return {
    ...start,
    latitudeDelta: Math.min(120, Math.max(0.0008, start.latitudeDelta * factor)),
    longitudeDelta: Math.min(300, Math.max(0.0008, start.longitudeDelta * factor)),
  }
}

/**
 * The map's gestures, done in JavaScript on iOS.
 *
 * On iOS 27 an Apple map from react-native-maps (1.29.11, the new
 * architecture) takes no pan, no pinch and, on a simulator, no tap either,
 * while Apple's own Maps app is fine: react-native-maps#6052, open with no
 * fix. Programmatic camera moves still work, so this layer sits over the map,
 * reads the gestures itself and moves the camera: a drag moves the region with
 * the finger, a pinch scales it about the middle, and a tap is handed back as
 * a point for the screen to match against its own pins (`pointFor`).
 *
 * Android's Google map takes its own gestures, so there this renders the map
 * alone. When react-native-maps ships a fix, delete this and pass `onPress` to
 * the markers again.
 */
export function MapGestures({
  mapRef,
  region,
  size,
  onRegion,
  onTap,
  onGestureStart,
  children,
}: {
  mapRef: React.RefObject<MapViewType | null>
  /** The region on screen now, as the map last reported it. */
  region: Region
  size: { width: number; height: number }
  /** Every camera move this layer makes, so pins can follow before the map reports back. */
  onRegion: (region: Region) => void
  onTap: (point: ScreenPoint) => void
  /** A drag or a pinch began: the user is moving the map by hand. */
  onGestureStart?: () => void
  children: ReactNode
}) {
  const start = useRef<Region>(region)
  const live = useRef<Region>(region)
  live.current = region

  if (Platform.OS !== 'ios') return children

  const move = (next: Region) => {
    live.current = next
    mapRef.current?.animateToRegion(next, 0)
    onRegion(next)
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(4)
    .onStart(() => {
      start.current = live.current
      onGestureStart?.()
    })
    .onUpdate((event) =>
      move(pannedRegion(start.current, size, event.translationX, event.translationY)),
    )

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      start.current = live.current
      onGestureStart?.()
    })
    .onUpdate((event) => move(pinchedRegion(start.current, event.scale)))

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomed = pinchedRegion(live.current, 2)
      live.current = zoomed
      mapRef.current?.animateToRegion(zoomed, 250)
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
