import { forwardRef, type ReactNode } from 'react'
import { Platform, StyleSheet, TurboModuleRegistry } from 'react-native'
import type MapViewType from 'react-native-maps'
import type { EdgePadding, MapPressEvent, MapStyleElement, Region } from 'react-native-maps'

import { useTheme } from '@/theme/useTheme'

type MapsModule = typeof import('react-native-maps')

let loaded: MapsModule | null | undefined

/**
 * react-native-maps, or null on a build without its native half. Required
 * lazily, like `expo-location` in `deviceLocation.ts`: a dev client built
 * before the map was added keeps working with its JS, and draws a note where
 * the map would be instead of a red box.
 */
export function mapsModule(): MapsModule | null {
  if (loaded !== undefined) return loaded
  try {
    // Asked first: the JS loads on any build, and a MapView without its
    // native half is a red screen rather than an exception.
    if (!TurboModuleRegistry.get('RNMapsAirModule')) {
      loaded = null
      return loaded
    }
    const mod = require('react-native-maps') as MapsModule
    loaded = mod?.default ? mod : null
  } catch {
    loaded = null
  }
  return loaded
}

// Google's map on Android, muted so the app's pins carry the colour; Apple's
// map on iOS follows light and dark by itself.
const ANDROID_LIGHT: MapStyleElement[] = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'geometry', stylers: [{ saturation: -35 }, { lightness: 8 }] },
]

const ANDROID_DARK: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#242424' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9a9a9a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#383838' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#14202b' }] },
]

type AppMapProps = {
  initialRegion?: Region
  mapPadding?: EdgePadding
  onRegionChangeComplete?: (region: Region, details?: { isGesture?: boolean }) => void
  /** The blue dot where the phone is. Needs location permission; ignored without it. */
  showsUserLocation?: boolean
  onPress?: (event: MapPressEvent) => void
  /** The map has a size and a camera: before this, a fit is ignored. */
  onMapReady?: () => void
  /** A still picture of a spot: no gestures, no labels to tap. */
  still?: boolean
  children?: ReactNode
}

/**
 * The app's one map: Apple Maps on iOS (no key), Google Maps on Android (the
 * Maps SDK key in `app.config.ts`), both from react-native-maps, as in
 * Money2Time. Callers check `mapsModule()` first and draw something else
 * without it.
 */
export const AppMap = forwardRef<MapViewType, AppMapProps>(function AppMapImpl(
  {
    initialRegion,
    mapPadding,
    onRegionChangeComplete,
    onPress,
    onMapReady,
    showsUserLocation = false,
    still = false,
    children,
  },
  ref,
) {
  const { isDark } = useTheme()
  const maps = mapsModule()
  if (!maps) return null
  const MapView = maps.default
  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === 'android' ? maps.PROVIDER_GOOGLE : maps.PROVIDER_DEFAULT}
      initialRegion={initialRegion}
      mapPadding={mapPadding}
      userInterfaceStyle={isDark ? 'dark' : 'light'}
      customMapStyle={
        Platform.OS === 'android' ? (isDark ? ANDROID_DARK : ANDROID_LIGHT) : undefined
      }
      // A still map is a picture on a card: no gestures, and Android draws
      // it as a bitmap, which costs nothing to scroll past. Spread rather than
      // passed as false on a live map, so the live one is exactly the default.
      {...(still
        ? {
            liteMode: Platform.OS === 'android',
            scrollEnabled: false,
            zoomEnabled: false,
            pointerEvents: 'none' as const,
            showsPointsOfInterests: false,
          }
        : {})}
      showsUserLocation={showsUserLocation && !still}
      showsCompass={false}
      showsScale={false}
      showsBuildings={false}
      showsTraffic={false}
      showsIndoors={false}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      moveOnMarkerPress={false}
      onRegionChangeComplete={onRegionChangeComplete}
      onPress={onPress}
      onMapReady={onMapReady}
    >
      {children}
    </MapView>
  )
})
