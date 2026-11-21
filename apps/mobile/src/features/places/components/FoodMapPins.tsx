import { Image } from 'expo-image'
import { memo, useEffect, useState } from 'react'
import { View } from 'react-native'

import { type IconRef, storedImageSource, useMealPhotoUrl } from '@/data'
import { Icon, Text } from '@/ui'

import { mapsModule } from './AppMap'

/**
 * Google Maps draws a marker's view as a snapshot, so a marker has to keep
 * redrawing until what it shows has settled (a photo arriving, a selection,
 * a theme switch) and then stop, or panning stutters. Apple Maps draws the
 * live view and ignores this. A photo landing restarts the window.
 */
export function useSettlingTracking(...deps: unknown[]): [boolean, () => void] {
  const [tracking, setTracking] = useState(true)
  const [kick, setKick] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the deps are the caller's
  useEffect(() => {
    setTracking(true)
    const timer = setTimeout(() => setTracking(false), 1500)
    return () => clearTimeout(timer)
  }, [kick, ...deps])
  return [tracking, () => setKick((n) => n + 1)]
}

const PIN = 52

type PlacePinProps = {
  id: string
  latitude: number
  longitude: number
  /** The place's newest photographed meal, else its newest drawing. */
  photoPath?: string
  icon?: IconRef
  count: number
  selected: boolean
  accessibilityLabel: string
  onPress: () => void
}

/** A place: the plate eaten there, in a round pin, with how many meals. */
export const PlacePin = memo(function PlacePin({
  id,
  latitude,
  longitude,
  photoPath,
  icon,
  count,
  selected,
  accessibilityLabel,
  onPress,
}: PlacePinProps) {
  const maps = mapsModule()
  const url = useMealPhotoUrl(photoPath)
  const source = photoPath ? storedImageSource(photoPath, url.data) : null
  const [tracking, landed] = useSettlingTracking(selected, source ? 1 : 0, count)
  if (!maps) return null
  return (
    <maps.Marker
      identifier={id}
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={{ x: 0, y: -(PIN / 2 + 6) }}
      tracksViewChanges={tracking}
      zIndex={selected ? 1000 : count}
      onPress={(event) => {
        event.stopPropagation()
        onPress()
      }}
      accessibilityLabel={accessibilityLabel}
    >
      <View className="items-center" style={{ paddingTop: 6, paddingRight: 6 }}>
        <View
          className={
            selected
              ? 'items-center justify-center overflow-hidden rounded-full border-[3px] border-pandan bg-surface'
              : 'items-center justify-center overflow-hidden rounded-full border-[3px] border-surface bg-surface'
          }
          style={{ width: PIN, height: PIN }}
        >
          {source ? (
            <Image
              source={source}
              style={{ width: PIN, height: PIN }}
              contentFit="cover"
              cachePolicy="memory-disk"
              onLoad={landed}
            />
          ) : (
            <Icon {...(icon ?? { set: 'ui', name: 'location' })} size={34} />
          )}
        </View>
        {/* The point, under the pin's middle. */}
        <View
          style={{
            width: 0,
            height: 0,
            marginTop: -2,
            borderLeftWidth: 7,
            borderRightWidth: 7,
            borderTopWidth: 8,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
          }}
          className={selected ? 'border-t-pandan' : 'border-t-surface'}
        />
        {count > 1 ? (
          <View className="absolute right-0 top-0 h-6 min-w-6 items-center justify-center rounded-full border-2 border-surface bg-ink px-1">
            <Text variant="micro" className="text-surface">
              {count > 99 ? '99+' : String(count)}
            </Text>
          </View>
        ) : null}
      </View>
    </maps.Marker>
  )
})

type ClusterPinProps = {
  id: string
  latitude: number
  longitude: number
  /** Meals under the bubble. */
  count: number
  selected: boolean
  accessibilityLabel: string
  onPress: () => void
}

/** Places close together at this zoom, as one bubble with how many meals. */
export const ClusterPin = memo(function ClusterPin({
  id,
  latitude,
  longitude,
  count,
  selected,
  accessibilityLabel,
  onPress,
}: ClusterPinProps) {
  const maps = mapsModule()
  const [tracking] = useSettlingTracking(count, selected)
  if (!maps) return null
  return (
    <maps.Marker
      identifier={id}
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracking}
      zIndex={selected ? 999 : 500 + count}
      onPress={(event) => {
        event.stopPropagation()
        onPress()
      }}
      accessibilityLabel={accessibilityLabel}
    >
      <View
        className={
          selected
            ? 'h-11 min-w-11 items-center justify-center rounded-full border-[3px] border-pandan-ink bg-pandan px-2'
            : 'h-11 min-w-11 items-center justify-center rounded-full border-[3px] border-surface bg-pandan px-2'
        }
      >
        <Text variant="label" className="text-on-pandan">
          {count > 99 ? '99+' : String(count)}
        </Text>
      </View>
    </maps.Marker>
  )
})

/** A place the picker lists, as a small red pin with a fork and spoon. */
export const NearbyPin = memo(function NearbyPin({
  latitude,
  longitude,
  label,
  onPress,
}: {
  latitude: number
  longitude: number
  label: string
  onPress: () => void
}) {
  const maps = mapsModule()
  const [tracking] = useSettlingTracking()
  if (!maps) return null
  return (
    <maps.Marker
      coordinate={{ latitude, longitude }}
      tracksViewChanges={tracking}
      onPress={(event) => {
        event.stopPropagation()
        onPress()
      }}
      accessibilityLabel={label}
    >
      <View className="h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-hibiscus">
        <Icon set="food" name="fork-spoon" size={14} />
      </View>
    </maps.Marker>
  )
})
