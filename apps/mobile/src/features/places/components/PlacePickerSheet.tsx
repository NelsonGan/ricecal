import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, ScrollView, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import type MapViewType from 'react-native-maps'
import type { Region } from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { type EntryLocation, useLocatedEntries } from '@/data'
import { currentLanguage } from '@/i18n'
import {
  type Coordinate,
  describeCoordinate,
  nearbyPlaces,
  openLocationSettings,
  type PlaceResult,
  PlaceSearchError,
  searchPlaces,
} from '@/lib/places'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, IconButton, SearchField, Spinner, Tappable, Text } from '@/ui'

import { placeCategoryIcon } from '../lib/placeIcons'
import {
  distanceMeters,
  formatDistance,
  locationKey,
  placeKey,
  placeOfLocation,
  recentPlaces,
  toEntryLocation,
} from '../lib/placeLocation'
import { useCurrentPlace } from '../services/useCurrentPlace'
import { AppMap, mapsModule } from './AppMap'
import { NearbyPin } from './FoodMapPins'
import { MapGestures, markerAt, type ScreenPoint } from './MapGestures'

/** How a place was chosen, for analytics. */
export type PlaceSource = 'current' | 'nearby' | 'recent' | 'search'

type Props = {
  visible: boolean
  /** The entry's place now, where the map opens and what Remove takes away. */
  current: EntryLocation | null
  /**
   * Whether the phone may be located. With Locations off the picker still
   * searches, pins and removes, and never asks where the phone is.
   */
  locating: boolean
  onClose: () => void
  onSelect: (location: EntryLocation, source: PlaceSource) => void
  onRemove: () => void
}

/**
 * Searching waits for a short pause in typing: each search that misses the
 * Worker's cache is an Apple Maps call from a daily allowance.
 */
const SEARCH_DEBOUNCE_MS = 350
/** The map settles, then its middle is named and its neighbours listed. */
const SETTLE_MS = 500
const MIN_QUERY = 2
/** The Worker refuses a longer one. */
const MAX_QUERY = 120
/** A listed place this close to the pin is what the pin is on. */
const SNAP_METERS = 40
/** Roughly a few streets: what "around here" means on a phone. */
const STREET_DELTA = 0.006
/** Where the map opens with nothing better to go on. */
const FALLBACK: Coordinate = { latitude: 3.139, longitude: 101.687 }

type Listing =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; places: PlaceResult[] }
  | { kind: 'error'; code: PlaceSearchError['code'] | 'unknown' }

const regionAround = (point: Coordinate, delta = STREET_DELTA): Region => ({
  latitude: point.latitude,
  longitude: point.longitude,
  latitudeDelta: delta,
  longitudeDelta: delta,
})

/**
 * Where a meal was eaten, map first (README: Meal locations): the map opens on
 * the phone (its blue dot) or the entry's place, the pin in its middle is the
 * answer, and the list under it is the food places around that pin. Drag the
 * map to put the pin anywhere; tap a place in the list or on the map to jump
 * to it; type to search. One button saves whatever the pin is on.
 *
 * A full-screen modal rather than a sheet, because a sheet over a map would
 * leave half a map to aim with.
 */
export function PlacePickerSheet({
  visible,
  current,
  locating,
  onClose,
  onSelect,
  onRemove,
}: Props) {
  const { t } = useTranslation(['places', 'common', 'logging'])
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const language = currentLanguage()
  const maps = mapsModule()
  const mapRef = useRef<MapViewType>(null)

  const here = useCurrentPlace({ active: visible && locating })
  const located = useLocatedEntries({ enabled: visible })

  /** The map's size, for the iOS gesture layer. */
  const [mapSize, setMapSize] = useState({ width: 1, height: 1 })
  /** Where the pin is: the map's middle once it settles. */
  const [center, setCenter] = useState<Coordinate | null>(null)
  /** The place the pin is on, when it is on one from a list or the map. */
  const [selected, setSelected] = useState<{ place: PlaceResult; source: PlaceSource } | null>(null)
  /** The pin's own spot, named by the geocoders, when it is on no listed place. */
  const [spot, setSpot] = useState<PlaceResult | null>(null)
  const [nearby, setNearby] = useState<Listing>({ kind: 'idle' })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Listing>({ kind: 'idle' })
  const searchId = useRef(0)
  const settleId = useRef(0)

  const trimmed = query.trim()
  const searching = trimmed.length >= MIN_QUERY
  // Read when a search fires, so moving the map or a fix landing ranks the
  // next search without starting one by itself.
  const nearRef = useRef<Coordinate | null>(null)
  nearRef.current = center ?? here.coordinate

  // Where the map first opens: the entry's own place, else the phone, else the
  // last place the user tagged, else the city the catalogue is centred on.
  const opening = useMemo<Coordinate | null>(() => {
    if (!visible) return null
    if (current) return current
    if (here.coordinate) return here.coordinate
    const last = located.data?.[0]?.location
    if (last) return last
    return here.status === 'locating' || here.status === 'idle' ? null : FALLBACK
  }, [visible, current, here.coordinate, here.status, located.data])
  const [initial, setInitial] = useState<Coordinate | null>(null)
  useEffect(() => {
    if (!visible) {
      setInitial(null)
      setCenter(null)
      setSelected(null)
      setSpot(null)
      setNearby({ kind: 'idle' })
      setQuery('')
      setResults({ kind: 'idle' })
      return
    }
    if (!initial && opening) {
      setInitial(opening)
      setCenter(opening)
      if (current) setSelected({ place: placeOfLocation(current), source: 'recent' })
    }
  }, [visible, opening, initial, current])

  const recents = useMemo(
    () => (visible ? recentPlaces(located.data ?? [], { near: center, limit: 3 }) : []),
    [visible, located.data, center],
  )

  // The pin settled: name the spot under it and list what is around it. Both
  // are skipped while a search is showing; the list is the results then.
  useEffect(() => {
    if (!visible || !center || searching) return undefined
    const id = ++settleId.current
    // The old spot's name is not this one's: until the new one is named the
    // pin is on nothing, and Use this spot waits rather than saving the last.
    setSpot(null)
    const timer = setTimeout(() => {
      setNearby((now) => (now.kind === 'done' ? now : { kind: 'loading' }))
      nearbyPlaces({ ...center, language })
        .then((places) => {
          if (id === settleId.current) setNearby({ kind: 'done', places })
        })
        .catch((error: unknown) => {
          if (id !== settleId.current) return
          setNearby({
            kind: 'error',
            code: error instanceof PlaceSearchError ? error.code : 'unknown',
          })
        })
      void describeCoordinate(center, { language }).then((place) => {
        if (id === settleId.current) setSpot(place)
      })
    }, SETTLE_MS)
    return () => clearTimeout(timer)
  }, [visible, center, searching, language])

  useEffect(() => {
    if (!visible || !searching) {
      searchId.current += 1
      setResults({ kind: 'idle' })
      return undefined
    }
    setResults({ kind: 'loading' })
    const id = ++searchId.current
    const timer = setTimeout(() => {
      searchPlaces({ query: trimmed, near: nearRef.current, language })
        .then((places) => {
          if (id !== searchId.current) return
          setResults({ kind: 'done', places })
          // The results, framed: a search is often for somewhere else.
          const points = places.slice(0, 8)
          if (points.length > 0 && mapRef.current) {
            mapRef.current.fitToCoordinates(points, {
              edgePadding: { top: 120, right: 48, bottom: 48, left: 48 },
              animated: true,
            })
          }
        })
        .catch((error: unknown) => {
          if (id !== searchId.current) return
          setResults({
            kind: 'error',
            code: error instanceof PlaceSearchError ? error.code : 'unknown',
          })
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [visible, searching, trimmed, language])

  // Nearest first, from wherever the distances are measured: the phone if it
  // is known, else the pin.
  const from = here.coordinate ?? center
  const sortNear = useCallback(
    (places: PlaceResult[]) =>
      from ? [...places].sort((a, b) => distanceMeters(from, a) - distanceMeters(from, b)) : places,
    [from],
  )
  const list = searching
    ? results.kind === 'done'
      ? sortNear(results.places)
      : []
    : nearby.kind === 'done'
      ? sortNear(nearby.places)
      : []

  // What the pin is on: a chosen place, a listed place right under it, or the
  // spot itself.
  const pinned = useMemo(() => {
    if (selected) return selected
    if (center) {
      const under = list.find((place) => distanceMeters(center, place) <= SNAP_METERS)
      if (under)
        return { place: under, source: searching ? ('search' as const) : ('nearby' as const) }
    }
    // The spot is not named while a search is showing, so it would be stale.
    return spot && !searching ? { place: spot, source: 'current' as const } : null
  }, [selected, center, list, spot, searching])

  /** A tap on the map, matched to the listed place whose pin is under it (see `MapGestures`). */
  const tapAt = (point: ScreenPoint) => {
    void markerAt(mapRef.current, point, list.slice(0, 12), { reach: 26 }).then((hit) => {
      if (hit) jumpTo(hit, searching ? 'search' : 'nearby')
    })
  }

  const jumpTo = (place: PlaceResult, source: PlaceSource) => {
    setSelected({ place, source })
    setCenter({ latitude: place.latitude, longitude: place.longitude })
    mapRef.current?.animateToRegion(regionAround(place), 300)
  }

  const save = () => {
    if (!pinned) return
    onClose()
    // The place the entry already has: nothing to write and nothing picked.
    if (current && placeKey(pinned.place) === locationKey(current)) return
    onSelect(toEntryLocation(pinned.place), pinned.source)
  }

  const locateMe = () => {
    if (here.status === 'ask') return void here.request()
    if (here.status === 'blocked' || here.status === 'services_off')
      return void openLocationSettings()
    if (here.coordinate) {
      setSelected(null)
      mapRef.current?.animateToRegion(regionAround(here.coordinate), 300)
    } else void here.refresh()
  }

  const listMessage = (() => {
    const listing = searching ? results : nearby
    if (listing.kind !== 'error') return searching ? t('places:noResults') : null
    if (listing.code === 'limit_reached') return t('places:searchLimit')
    if (listing.code === 'busy' || listing.code === 'rate_limited') return t('places:searchBusy')
    if (listing.code === 'not_available') return t('places:searchUnavailable')
    return t('places:searchError')
  })()
  const loading = (searching ? results : nearby).kind === 'loading'

  const mapHeight = '46%'

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {/* A modal is its own window, outside the app's gesture root, and the
          map's iOS gestures (`MapGestures`) need one of their own here. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-canvas">
          <View
            style={{ height: mapHeight }}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout
              setMapSize({ width, height })
            }}
          >
            {maps && initial ? (
              <MapGestures
                mapRef={mapRef}
                size={mapSize}
                onGestureStart={() => setSelected(null)}
                onTap={tapAt}
              >
                <AppMap
                  ref={mapRef}
                  initialRegion={regionAround(initial)}
                  showsUserLocation={locating && here.status === 'ready'}
                  onRegionChangeComplete={(region, details) => {
                    setCenter({ latitude: region.latitude, longitude: region.longitude })
                    // A drag puts the pin somewhere new; a jump the app made keeps
                    // the place it jumped to.
                    if (details?.isGesture) setSelected(null)
                  }}
                >
                  {list.slice(0, 12).map((place) => (
                    <NearbyPin
                      key={placeKey(place)}
                      latitude={place.latitude}
                      longitude={place.longitude}
                      label={place.name}
                      onPress={() => jumpTo(place, searching ? 'search' : 'nearby')}
                    />
                  ))}
                </AppMap>
              </MapGestures>
            ) : (
              <View className="flex-1 items-center justify-center bg-surface-alt">
                {maps ? <Spinner /> : <Text variant="meta">{t('places:mapUnavailable')}</Text>}
              </View>
            )}

            {/* The pin is the map's middle, drawn over it rather than a marker,
              so it stays put while the map moves under it. */}
            {maps && initial ? (
              <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
                <View className="items-center" style={{ marginBottom: 44 }}>
                  {pinned ? (
                    <View className="mb-1 max-w-[240px] rounded-full bg-surface px-3 py-1 shadow-sm">
                      <Text variant="caption" className="text-ink" numberOfLines={1}>
                        {pinned.place.name}
                      </Text>
                    </View>
                  ) : null}
                  <Icon set="ui" name="location" size={40} />
                </View>
              </View>
            ) : null}

            {/* Close and search, floating over the map's top edge. */}
            <View
              className="absolute left-0 right-0 flex-row items-center gap-2 px-gutter"
              style={{ top: insets.top + 8 }}
            >
              <IconButton
                size="xs"
                variant="neutral"
                onPress={onClose}
                accessibilityLabel={t('common:action.close')}
              >
                <Icon set="ui" name="close" size={14} tintColor={colors.ink} />
              </IconButton>
              <View className="flex-1">
                <SearchField
                  size="sm"
                  value={query}
                  onChangeText={(next) => {
                    setQuery(next.slice(0, MAX_QUERY))
                    setSelected(null)
                  }}
                  placeholder={t('places:searchPlaceholder')}
                  onClear={() => setQuery('')}
                  clearLabel={t('logging:search.clear')}
                  accessibilityLabel={t('places:searchPlaceholder')}
                />
              </View>
            </View>

            {locating && here.status !== 'unavailable' ? (
              <View className="absolute bottom-3 right-gutter">
                <IconButton
                  size="xs"
                  variant="neutral"
                  onPress={locateMe}
                  accessibilityLabel={t('places:current')}
                >
                  <Icon set="ui" name="locate" size={22} />
                </IconButton>
              </View>
            ) : null}
          </View>

          <View className="-mt-5 flex-1 rounded-t-sheet bg-surface">
            <View className="items-center pt-2">
              <View className="h-1.5 w-10 rounded-full bg-track" />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 }}
            >
              <Text variant="subtitle" className="mb-1">
                {t('places:pickerTitle')}
              </Text>

              {!searching && recents.length > 0 ? (
                <View className="mb-1 flex-row flex-wrap gap-2 py-1">
                  {recents.map((place) => (
                    <Tappable
                      key={placeKey(place)}
                      onPress={() => jumpTo(place, 'recent')}
                      accessibilityRole="button"
                      accessibilityLabel={place.name}
                      className="max-w-[200px] rounded-full bg-surface-alt px-3 py-1.5"
                    >
                      <Text variant="caption" className="text-ink" numberOfLines={1}>
                        {place.name}
                      </Text>
                    </Tappable>
                  ))}
                </View>
              ) : null}

              <Text variant="overlineSm" className="pb-1 pt-2">
                {searching ? t('places:results') : t('places:nearby')}
              </Text>

              {loading && list.length === 0 ? (
                <View className="items-center py-lg">
                  <Spinner />
                </View>
              ) : list.length === 0 && listMessage ? (
                <Text variant="meta" className="py-md text-center">
                  {listMessage}
                </Text>
              ) : (
                list.map((place) => {
                  const on = pinned !== null && placeKey(pinned.place) === placeKey(place)
                  const distance = from ? formatDistance(distanceMeters(from, place), language) : ''
                  return (
                    <Tappable
                      key={placeKey(place)}
                      onPress={() => jumpTo(place, searching ? 'search' : 'nearby')}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={[place.name, distance].filter(Boolean).join(', ')}
                      className={
                        on
                          ? '-mx-2 flex-row items-center gap-3 rounded-sm bg-pandan-soft px-2 py-2'
                          : '-mx-2 flex-row items-center gap-3 px-2 py-2'
                      }
                    >
                      <Icon {...placeCategoryIcon(place.category)} size={26} />
                      <Text variant="label" numberOfLines={1} className="min-w-0 flex-1">
                        {place.name}
                      </Text>
                      {distance ? <Text variant="caption">{distance}</Text> : null}
                      {on ? (
                        <Icon set="ui" name="check" size={16} tintColor={colors.pandan} />
                      ) : null}
                    </Tappable>
                  )
                })
              )}
            </ScrollView>

            <View
              className="gap-2 border-t border-line px-gutter pt-3"
              style={{ paddingBottom: Math.max(insets.bottom, 12) }}
            >
              <Button fullWidth disabled={!pinned} onPress={save}>
                {t('places:useSpot')}
              </Button>
              {current ? (
                <Button
                  fullWidth
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    onClose()
                    onRemove()
                  }}
                >
                  {t('places:remove')}
                </Button>
              ) : null}
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}
