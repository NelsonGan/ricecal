import { format } from 'date-fns/format'
import { parseISO } from 'date-fns/parseISO'
import { useRouter } from 'expo-router'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import type MapViewType from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ENTRY_FOOD_ID, type LocatedEntry, today, useLocatedEntries, useUserId } from '@/data'
import { count } from '@/features/activity/format'
import { formatTime } from '@/features/shared'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { useLocationsPreference } from '@/lib/places'
import { ReplayMask } from '@/lib/replay-mask'
import { useThemeColors } from '@/theme/useTheme'
import { Button, FLOAT_SHADOW, Icon, Skeleton, Tappable, Text } from '@/ui'

import { AppMap, mapsModule } from './components/AppMap'
import { Chevron } from './components/Chevron'
import { ClusterPin, PlaceCover, PlacePin } from './components/FoodMapPins'
import { MapGestures, markerAt, type ScreenPoint } from './components/MapGestures'
import { fitMapToPoints } from './lib/fitMap'
import {
  inPeriod,
  isCurrentPeriod,
  type MapPeriod,
  periodRange,
  shiftPeriod,
} from './lib/mapPeriod'
import {
  CLUSTER_MAX_ZOOM,
  createPlaceClusterer,
  longitudeDeltaForZoom,
  type PlaceMarker,
  zoomForRegion,
} from './lib/placeClusters'
import {
  coverEntry,
  groupByPlace,
  HOME_COORDINATE,
  type MapRegion,
  mapKitRegion,
  type PlaceGroup,
  regionAround,
  regionFor,
} from './lib/placeLocation'
import { useCurrentPlace } from './services/useCurrentPlace'

type Selection = { kind: 'place'; key: string } | { kind: 'cluster'; keys: string[] } | null

/** Where the map opens with nothing on it: the region the catalogue is centred on. */
const HOME_REGION = regionAround(HOME_COORDINATE, 0.4)

/** One place, or places at one spot, shown at about a neighbourhood. */
const ONE_SPOT_DELTA = 0.02

/** The idle panel: the period and its totals over one row of place cards. */
const PANEL_HEIGHT = 220

/** The switch over the map, in its order. */
const PERIOD_KINDS = ['week', 'month', 'all'] as const

/** The selected place's floating card. */
const PLACE_CARD_HEIGHT = 228
const PLACE_CARD_WIDTH = 132

/**
 * The food map (README: Meal locations): every tagged meal of a week, a month
 * or all time, one pin per place wearing the plate eaten there, merged into a
 * count bubble where places crowd at the current zoom. Tapping a place lists
 * its meals; tapping a bubble zooms in, or lists its places once it cannot
 * split. Money2Time's spending map is the model, with plates where it has
 * price tags.
 */
export function FoodMapScreen() {
  const { t } = useTranslation(['places', 'common'])
  const router = useRouter()
  const back = useBack('/today')
  const userId = useUserId()
  const { enabled } = useLocationsPreference(userId)
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const mapRef = useRef<MapViewType>(null)
  const maps = mapsModule()
  const colors = useThemeColors()

  const located = useLocatedEntries()
  // The blue dot and the locate button, only with Locations on: the map never
  // asks where the phone is otherwise.
  const here = useCurrentPlace({ active: enabled })
  const showMe = enabled && here.status === 'ready'
  const [period, setPeriod] = useState<MapPeriod>({ kind: 'month', anchor: today() })
  const [selection, setSelection] = useState<Selection>(null)

  const groups = useMemo(
    () => groupByPlace((located.data ?? []).filter((entry) => inPeriod(entry.logDate, period))),
    [located.data, period],
  )
  const groupByKey = useMemo(() => new Map(groups.map((group) => [group.key, group])), [groups])

  // Fixed at the first render: react-native-maps re-applies a changed
  // `initialRegion` on the new architecture, which snapped every pan back.
  // Every later move is a fit (`fitAll`) or a tap.
  const [initialRegion] = useState<MapRegion>(
    () => regionFor(groups, { padding: 1.5, minDelta: ONE_SPOT_DELTA }) ?? HOME_REGION,
  )
  // The clusters follow the region, but not while a hand is on the map: the
  // iOS gesture layer moves the camera every frame and MapKit reports each
  // move, which re-rendered the whole screen and every pin per frame. The
  // latest region is kept in a ref and committed when the gesture ends.
  // MapKit reports nothing after the app's own `animateToRegion`, so a move
  // the screen makes records where it went itself (`moveTo`).
  const [region, setRegion] = useState<MapRegion>(initialRegion)
  const regionRef = useRef<MapRegion>(initialRegion)
  const moving = useRef(false)
  const onRegionChange = useCallback((next: MapRegion) => {
    regionRef.current = next
    if (!moving.current) setRegion(next)
  }, [])
  const onGestureStart = useCallback(() => {
    moving.current = true
  }, [])
  const onGestureEnd = useCallback(() => {
    moving.current = false
    setRegion(regionRef.current)
  }, [])
  const moveTo = useCallback(
    (target: MapRegion | null, duration = 300) => {
      if (!target) return
      const safe = mapKitRegion(target)
      mapRef.current?.animateToRegion(safe, duration)
      onRegionChange(safe)
    },
    [onRegionChange],
  )
  const clusterer = useMemo(() => createPlaceClusterer(groups), [groups])
  const markers = useMemo(() => clusterer(region, width), [clusterer, region, width])
  const markersRef = useRef(markers)
  markersRef.current = markers

  // The panel under the map: a line of totals over a row of place cards, or
  // the selected place's card, which is taller for its meals.
  const panelHeight = selection
    ? PLACE_CARD_HEIGHT + insets.bottom + 16
    : PANEL_HEIGHT + insets.bottom
  const topInset = insets.top + 64
  const mapPadding = useMemo(
    () => ({ top: topInset, right: 0, bottom: panelHeight, left: 0 }),
    [topInset, panelHeight],
  )

  const fitAll = useCallback(
    (animated: boolean) =>
      fitMapToPoints(mapRef.current, groups, moveTo, {
        minDelta: ONE_SPOT_DELTA,
        margin: { top: 48, right: 64, bottom: 32, left: 64 },
        mapPadding,
        animated,
        size: { width, height },
      }),
    [groups, mapPadding, width, height, moveTo],
  )

  // A fit closes the place panel first and frames the places once the panel is
  // back to its own height: read with the taller panel, they end up framed
  // too small.
  const [fitRequest, setFitRequest] = useState<{ animated: boolean } | null>(null)
  // A fit sent before the map has laid out is dropped by MapKit, which then
  // stays on its first region.
  const [mapReady, setMapReady] = useState(false)
  const requestFit = useCallback((animated: boolean) => {
    setSelection(null)
    setFitRequest({ animated })
  }, [])
  useEffect(() => {
    if (!fitRequest || !mapReady || selection || groups.length === 0) return
    fitAll(fitRequest.animated)
    setFitRequest(null)
  }, [fitRequest, mapReady, selection, fitAll, groups.length])

  // A new period, or the entries arriving, frames the map around its places.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on the period and the first answer only
  useEffect(() => {
    requestFit(true)
  }, [period, located.data === undefined, requestFit])

  // Once per visit, with how many places the screen opened on.
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current || located.data === undefined) return
    opened.current = true
    track('Food Map Opened', { places: groups.length })
  }, [located.data, groups.length])

  const selectedGroups: PlaceGroup[] = useMemo(() => {
    if (!selection) return []
    const keys = selection.kind === 'place' ? [selection.key] : selection.keys
    return keys.map((key) => groupByKey.get(key)).filter((group): group is PlaceGroup => !!group)
  }, [selection, groupByKey])
  // A selection whose places left with the period closes.
  useEffect(() => {
    if (selection && selectedGroups.length === 0) setSelection(null)
  }, [selection, selectedGroups.length])

  // Read through refs, so the handlers stay the same across renders and the
  // pins' memo holds while the map moves.
  const focusPlace = useCallback(
    (group: PlaceGroup) => {
      setSelection({ kind: 'place', key: group.key })
      const delta = Math.min(regionRef.current.longitudeDelta, ONE_SPOT_DELTA)
      moveTo(regionAround(group, delta))
    },
    [moveTo],
  )

  const pressMarker = useCallback(
    (marker: PlaceMarker) => {
      if (marker.kind === 'place') return focusPlace(marker.group)
      const zoom = zoomForRegion(regionRef.current, width)
      // A bubble that can still split zooms in to where it does; one that
      // cannot (places at one point, or past the last zoom) lists its places.
      if (marker.expansionZoom <= CLUSTER_MAX_ZOOM && marker.expansionZoom > zoom) {
        // Add 0.5 so `Math.floor(zoom)` in the clusterer clears `expansionZoom`
        // even after float rounding or viewport aspect adjustments.
        const delta = longitudeDeltaForZoom(marker.expansionZoom + 0.5, width)
        moveTo(regionAround(marker, delta))
        return
      }
      setSelection({ kind: 'cluster', keys: marker.groups.map((group) => group.key) })
    },
    [focusPlace, moveTo, width],
  )
  const pressKey = useCallback(
    (key: string) => {
      const marker = markersRef.current.find((each) => each.key === key)
      if (marker) pressMarker(marker)
    },
    [pressMarker],
  )

  /**
   * A tap on the map, matched to the pin under it (the iOS gesture layer hands
   * taps over as points; see `MapGestures`). A place pin stands on its spot, so
   * its face is about 32 points above it; a bubble is centred on its spot.
   * Nothing within reach closes whatever was open.
   */
  const tapAt = useCallback(
    (point: ScreenPoint) => {
      void markerAt(mapRef.current, point, markersRef.current, {
        lift: (marker) => (marker.kind === 'place' ? 32 : 0),
      }).then((hit) => (hit ? pressMarker(hit) : setSelection(null)))
    },
    [pressMarker],
  )
  const mapSize = useMemo(() => ({ width, height }), [width, height])

  const openEntry = (entry: LocatedEntry) =>
    router.push({
      pathname: '/log/food/[id]',
      params: { id: entry.foodId ?? ENTRY_FOOD_ID, entryId: entry.id, date: entry.logDate },
    })

  const totalMeals = groups.reduce((sum, group) => sum + group.entries.length, 0)
  const totalKcal = groups.reduce((sum, group) => sum + group.kcal, 0)

  const periodLabel = (() => {
    const range = periodRange(period)
    if (!range) return t('places:all')
    if (period.kind === 'month') return format(parseISO(range.from), datePattern('monthYear'))
    return `${format(parseISO(range.from), datePattern('dayMonth'))} - ${format(
      parseISO(range.to),
      datePattern('dayMonth'),
    )}`
  })()
  const atLatest = isCurrentPeriod(period, today())
  const placed = selection?.kind === 'place' ? selectedGroups[0] : undefined
  const cards = selection?.kind === 'cluster' ? selectedGroups : groups
  const totals = [
    t('places:placesCount', { count: groups.length }),
    t('places:meals', { count: totalMeals }),
    `${count(totalKcal)} ${t('common:unit.kcal')}`,
  ].join(' · ')

  const locateMe = () => {
    const me = here.coordinate
    if (!me) return
    setSelection(null)
    moveTo(regionAround(me, ONE_SPOT_DELTA))
  }

  return (
    <View className="flex-1 bg-canvas">
      {/* Where somebody eats is their location history: kept out of replays. */}
      <ReplayMask style={StyleSheet.absoluteFill}>
        {maps ? (
          <MapGestures
            mapRef={mapRef}
            size={mapSize}
            onTap={tapAt}
            onGestureStart={onGestureStart}
            onGestureEnd={onGestureEnd}
          >
            <AppMap
              ref={mapRef}
              initialRegion={initialRegion}
              mapPadding={mapPadding}
              showsUserLocation={showMe}
              onRegionChangeComplete={onRegionChange}
              onPress={() => setSelection(null)}
              onMapReady={() => setMapReady(true)}
            >
              {markers.map((marker) => {
                if (marker.kind === 'cluster') {
                  const selected =
                    selection?.kind === 'cluster' &&
                    marker.groups.length === selection.keys.length &&
                    marker.groups.every((group) => selection.keys.includes(group.key))
                  return (
                    <ClusterPin
                      key={`${marker.key}:${selected ? 'on' : 'off'}`}
                      id={marker.key}
                      latitude={marker.latitude}
                      longitude={marker.longitude}
                      count={marker.count}
                      selected={selected}
                      accessibilityLabel={t('places:placesHere', { count: marker.groups.length })}
                      onPress={pressKey}
                    />
                  )
                }
                const cover = coverEntry(marker.group.entries)
                const selected = selection?.kind === 'place' && selection.key === marker.group.key
                return (
                  <PlacePin
                    // A new marker when the selection moves: Google Maps redraws
                    // a marker's picture only while it tracks changes, and a
                    // ring turning green after that window never showed.
                    key={`${marker.key}:${selected ? 'on' : 'off'}`}
                    id={marker.key}
                    latitude={marker.latitude}
                    longitude={marker.longitude}
                    photoPath={cover?.photoPath}
                    icon={cover?.icon}
                    count={marker.group.entries.length}
                    selected={selected}
                    accessibilityLabel={`${marker.group.name}, ${t('places:meals', {
                      count: marker.group.entries.length,
                    })}`}
                    onPress={pressKey}
                  />
                )
              })}
            </AppMap>
          </MapGestures>
        ) : (
          <View className="flex-1 items-center justify-center px-gutter">
            <Text variant="meta" className="text-center">
              {t('places:mapUnavailable')}
            </Text>
          </View>
        )}
      </ReplayMask>

      {/* Back, and which kind of period, floating over the map. Which period
          of that kind, with its arrows, heads the panel below. */}
      <View
        className="absolute left-0 right-0 top-0 h-10 items-center justify-center"
        style={{ marginTop: insets.top + 6 }}
        pointerEvents="box-none"
      >
        <View className="absolute left-gutter">
          <RoundButton onPress={back} label={t('common:a11y.back')}>
            <Chevron direction="left" color={colors.ink} />
          </RoundButton>
        </View>
        <View
          className="h-10 flex-row items-center rounded-full bg-surface p-1"
          style={FLOAT_SHADOW}
          accessibilityRole="tablist"
        >
          {PERIOD_KINDS.map((kind) => {
            const on = period.kind === kind
            return (
              <Tappable
                key={kind}
                // The kind already shown is not a new period: no refit.
                onPress={() => setPeriod((now) => (now.kind === kind ? now : { ...now, kind }))}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t(`places:${kind}`)}
                className={
                  on
                    ? 'h-8 justify-center rounded-full bg-pandan px-4'
                    : 'h-8 justify-center rounded-full px-4'
                }
              >
                <Text variant="label" className={on ? 'text-on-pandan' : 'text-heading'}>
                  {t(`places:${kind}Short`)}
                </Text>
              </Tappable>
            )
          })}
        </View>
      </View>

      {/* Locate and fit, stacked over the panel's top right corner. */}
      <View className="absolute right-gutter gap-2" style={{ bottom: panelHeight + 12 }}>
        {showMe ? (
          <RoundButton onPress={locateMe} label={t('places:current')}>
            <Icon set="ui" name="locate" size={20} />
          </RoundButton>
        ) : null}
        {maps && groups.length > 1 ? (
          <RoundButton onPress={() => requestFit(true)} label={t('places:showAll')}>
            <Icon set="ui" name="expand" size={16} tintColor={colors.ink} />
          </RoundButton>
        ) : null}
      </View>

      {placed ? (
        <PlaceCard
          group={placed}
          bottom={insets.bottom + 8}
          onClose={() => setSelection(null)}
          onOpenEntry={openEntry}
        />
      ) : (
        <View
          className="absolute bottom-0 left-0 right-0 rounded-t-sheet bg-surface"
          style={{ height: panelHeight, paddingBottom: insets.bottom }}
        >
          <View className="items-center pt-2">
            <View className="h-1 w-9 rounded-full bg-track" />
          </View>
          {selection?.kind === 'cluster' ? null : (
            <View className="flex-row items-center gap-2 px-gutter pt-1">
              <View className="min-w-0 flex-1">
                <Text variant="heading" numberOfLines={1}>
                  {periodLabel}
                </Text>
                {groups.length > 0 ? (
                  <Text variant="meta" numberOfLines={1}>
                    {totals}
                  </Text>
                ) : null}
              </View>
              {period.kind === 'all' ? null : (
                <>
                  <PagerButton
                    direction="left"
                    onPress={() => setPeriod((now) => shiftPeriod(now, -1))}
                    label={t('places:previous')}
                  />
                  <PagerButton
                    direction="right"
                    onPress={() => setPeriod((now) => shiftPeriod(now, 1))}
                    label={t('places:next')}
                    disabled={atLatest}
                  />
                </>
              )}
            </View>
          )}
          {located.isPending ? (
            <View className="gap-3 px-gutter pt-3">
              <View className="flex-row gap-3">
                <Skeleton className="h-[120px] w-[132px] rounded-tile" />
                <Skeleton className="h-[120px] w-[132px] rounded-tile" />
              </View>
            </View>
          ) : groups.length === 0 ? (
            <View className="flex-1 items-center justify-center gap-2 px-gutter">
              <Icon set="ui" name="map" size={44} />
              <Text variant="label">{t('places:emptyTitle')}</Text>
              {enabled ? (
                <Text variant="meta" className="text-center">
                  {t('places:emptyBody')}
                </Text>
              ) : (
                <Button size="sm" onPress={() => router.push('/settings/personalisation')}>
                  {t('places:offerAccept')}
                </Button>
              )}
            </View>
          ) : (
            <>
              {selection?.kind === 'cluster' ? (
                <View className="flex-row items-center justify-between px-gutter pt-1">
                  <Text variant="heading" numberOfLines={1} className="min-w-0 flex-1">
                    {t('places:placesHere', { count: cards.length })}
                  </Text>
                  <Tappable
                    onPress={() => setSelection(null)}
                    accessibilityRole="button"
                    accessibilityLabel={t('common:action.close')}
                    hitSlop={8}
                    className="h-8 w-8 items-center justify-center rounded-full bg-surface-alt"
                  >
                    <Icon set="ui" name="close" size={12} tintColor={colors.muted} />
                  </Tappable>
                </View>
              ) : null}
              <ScrollView
                className="mt-3"
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 10, alignItems: 'flex-start' }}
              >
                {cards.map((group) => (
                  <PlaceTile
                    key={group.key}
                    group={group}
                    onPress={() => focusPlace(group)}
                    caption={t('places:meals', { count: group.entries.length })}
                  />
                ))}
              </ScrollView>
            </>
          )}
        </View>
      )}
    </View>
  )
}

/** The panel's earlier and later arrows, round and outlined. */
function PagerButton({
  direction,
  onPress,
  label,
  disabled = false,
}: {
  direction: 'left' | 'right'
  onPress: () => void
  label: string
  disabled?: boolean
}) {
  const colors = useThemeColors()
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={4}
      className="h-10 w-10 items-center justify-center rounded-full border border-line"
    >
      <Chevron direction={direction} size={8} color={disabled ? colors.faint : colors.ink} />
    </Tappable>
  )
}

/** A small round floating control over the map. */
function RoundButton({
  onPress,
  label,
  children,
}: {
  onPress: () => void
  label: string
  children: ReactNode
}) {
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      className="h-10 w-10 items-center justify-center rounded-full bg-surface"
      style={FLOAT_SHADOW}
    >
      {children}
    </Tappable>
  )
}

/** The plate a place is known by: its newest photo, else its drawing. */
function Cover({ entry, size }: { entry: LocatedEntry | undefined; size: number }) {
  return <PlaceCover photoPath={entry?.photoPath} icon={entry?.icon} size={size} />
}

/** A place in the panel's row: its plate, its name and how many meals. */
function PlaceTile({
  group,
  caption,
  onPress,
}: {
  group: PlaceGroup
  caption: string
  onPress: () => void
}) {
  const cover = coverEntry(group.entries)
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${caption}`}
      className="overflow-hidden rounded-tile border-2 border-track bg-surface"
      style={{ width: PLACE_CARD_WIDTH }}
    >
      <View className="h-[72px] items-center justify-center overflow-hidden bg-surface-alt">
        <Cover entry={cover} size={48} />
      </View>
      <View className="px-2.5 py-2">
        {/* Where somebody eats is their location history: kept out of replays. */}
        <ReplayMask>
          <Text variant="label" numberOfLines={1}>
            {group.name}
          </Text>
        </ReplayMask>
        <Text variant="caption" numberOfLines={1}>
          {caption}
        </Text>
      </View>
    </Tappable>
  )
}

/** The selected place, floating over the map: its totals and its meals. */
function PlaceCard({
  group,
  bottom,
  onClose,
  onOpenEntry,
}: {
  group: PlaceGroup
  bottom: number
  onClose: () => void
  onOpenEntry: (entry: LocatedEntry) => void
}) {
  const { t } = useTranslation(['places', 'common'])
  const colors = useThemeColors()
  return (
    <View
      className="absolute left-3 right-3 rounded-card bg-surface px-md pb-md pt-3"
      style={[FLOAT_SHADOW, { bottom, height: PLACE_CARD_HEIGHT }]}
    >
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-sm bg-surface-alt">
          <Cover entry={coverEntry(group.entries)} size={34} />
        </View>
        <View className="min-w-0 flex-1">
          <ReplayMask>
            <Text variant="heading" numberOfLines={1}>
              {group.name}
            </Text>
          </ReplayMask>
          <Text variant="meta" numberOfLines={1}>
            {`${t('places:meals', { count: group.entries.length })} · ${count(group.kcal)} ${t(
              'common:unit.kcal',
            )}`}
          </Text>
        </View>
        <Tappable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common:action.close')}
          hitSlop={8}
          className="h-8 w-8 items-center justify-center rounded-full bg-surface-alt"
        >
          <Icon set="ui" name="close" size={12} tintColor={colors.muted} />
        </Tappable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-3"
        contentContainerStyle={{ gap: 10 }}
      >
        {group.entries.map((entry) => (
          <Tappable
            key={entry.id}
            onPress={() => onOpenEntry(entry)}
            accessibilityRole="button"
            accessibilityLabel={`${entry.foodName}, ${format(
              parseISO(entry.logDate),
              datePattern('dayMonth'),
            )}`}
            className="w-[96px] gap-1"
          >
            <View className="h-[84px] w-[96px] items-center justify-center overflow-hidden rounded-sm bg-surface-alt">
              <Cover entry={entry} size={52} />
            </View>
            <Text variant="caption" className="text-ink" numberOfLines={1}>
              {entry.foodName}
            </Text>
            <Text variant="micro" numberOfLines={1}>
              {`${format(parseISO(entry.logDate), datePattern('dayMonth'))} · ${formatTime(entry.loggedAt)}`}
            </Text>
          </Tappable>
        ))}
      </ScrollView>
    </View>
  )
}
