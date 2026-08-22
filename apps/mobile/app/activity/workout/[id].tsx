import { format, parseISO } from 'date-fns'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useActivitySession } from '@/data'
import {
  clock,
  count,
  distance,
  pace,
  showsDistance,
  showsPace,
  showsSpeed,
  speed,
  workoutIcon,
  workoutKindKey,
} from '@/features/activity'
import type { Stat } from '@/features/shared'
import { datePattern } from '@/lib/dates'
import { ZONE_KEY, ZONE_ORDER, type ZoneName } from '@/lib/health'
import { useBack } from '@/lib/navigation'
import { AppBar, Card, EmptyState, Icon, Screen, Skeleton, StatTile, Text } from '@/ui'

/**
 * A3 / N4: one workout.
 *
 * Everything the session measured is one grid of tiles, and the zone chart is
 * the only thing under it. The heart rate used to sit BELOW the chart, so a
 * game whose zones could not be banded put an explanation where the numbers
 * should have been and the numbers below the fold.
 *
 * NO EMPTY STATE FOR THE ZONE CARD. It carried three of them — one average
 * only, one average from a named app, no pulse at all — and each was a
 * paragraph telling the reader what their watch should have written. Two of the
 * three were wrong on a session an Apple Watch had measured all the way
 * through, because the reason those bands are missing is on the phone rather
 * than in the session. A card with nothing to draw is not drawn.
 */
export default function WorkoutScreen() {
  const { t } = useTranslation(['activity', 'common'])
  const goBack = useBack('/(tabs)/activity')
  const { id } = useLocalSearchParams<{ id: string }>()

  const { data: session, isPending } = useActivitySession(id)

  const title = session
    ? (session.kindLabel ?? t(workoutKindKey(session.kind)))
    : t('activity:title')

  if (isPending) {
    return (
      <Screen>
        <AppBar title={title} onBack={goBack} backLabel={t('common:action.back')} />
        <Card>
          <Skeleton className="h-[220px] w-full" />
        </Card>
      </Screen>
    )
  }

  if (!session) {
    return (
      <Screen>
        <AppBar title={title} onBack={goBack} backLabel={t('common:action.back')} />
        <EmptyState
          title={t('activity:workout.missing')}
          icon={{ set: 'body', name: 'stopwatch' }}
        />
      </Screen>
    )
  }

  /**
   * All three read the same `distanceM`, so all three are gated on the same
   * question first: does this kind have a distance worth showing at all?
   *
   * `kmh` was not, and the omission was visible on the screen. A badminton game
   * and a basketball game both carry a distance in the store — the watch counted
   * a few hundred metres of shuffling — and `showsDistance` exists precisely to
   * keep that figure off the screen. Computing a speed from it anyway put
   * "PACE 2.0 km/h" on a basketball session: the same number the app had just
   * decided was meaningless, divided by time and given a label.
   *
   * So: distance for the kinds that travel, a pace for the ones done on foot, a
   * speed for the rest of the ones that travel, and nothing at all for a sport
   * played inside a court.
   */
  const far = showsDistance(session.kind) ? distance(session.distanceM) : null
  const perKm = showsPace(session.kind) ? pace(session.durationS, session.distanceM) : null
  const kmh = showsSpeed(session.kind) ? speed(session.durationS, session.distanceM) : null

  // Assembled rather than a fixed set, because a badminton game has no distance
  // and a treadmill run has no speed worth printing. A tile that renders a dash
  // says nothing, and three of them beside a real figure hide it.
  //
  // One list rather than two. The heart rate was a second row under the zone
  // chart, which put the two numbers most sessions have furthest from the top
  // and left a lone TIME tile above a card explaining itself.
  const stats: Stat[] = []
  if (far) stats.push({ key: 'distance', label: t('activity:workout.distance'), value: far })
  stats.push({ key: 'time', label: t('activity:workout.time'), value: clock(session.durationS) })
  if (perKm) {
    stats.push({
      key: 'pace',
      label: t('activity:workout.pace'),
      value: t('activity:workout.paceUnit', { value: perKm }),
    })
  } else if (kmh) {
    stats.push({
      key: 'speed',
      // Its own label. A speed under a tile headed PACE is a unit contradicting
      // its heading — pace counts up as you slow down and speed counts down,
      // and a cyclist reading "PACE 24.1 km/h" has to work out which they were
      // given.
      label: t('activity:workout.speed'),
      value: t('activity:workout.speedUnit', { value: kmh }),
    })
  }
  if (session.avgHr) {
    stats.push({
      key: 'avg-hr',
      label: t('activity:workout.avgHr'),
      value: t('activity:workout.bpm', { value: session.avgHr }),
    })
  }
  if (session.maxHr) {
    stats.push({
      key: 'max-hr',
      label: t('activity:workout.maxHr'),
      value: t('activity:workout.bpm', { value: session.maxHr }),
    })
  }
  if (session.elevationM != null) {
    stats.push({
      key: 'elevation',
      label: t('activity:workout.elevation'),
      value: t('activity:workout.metres', { value: session.elevationM }),
    })
  }

  const zones = session.hrZones
  const zoneTotal = zones ? ZONE_ORDER.reduce((sum, name) => sum + zones[name], 0) : 0
  const rows = rowsOfThree(stats)

  return (
    <Screen>
      <AppBar
        title={format(parseISO(session.startedAt), datePattern('weekdayTime'))}
        onBack={goBack}
        backLabel={t('common:action.back')}
      />

      <Card>
        <View className="items-center gap-1.5">
          <Icon {...workoutIcon(session.kind)} size={56} />
          <Text variant="title">{session.kindLabel ?? t(workoutKindKey(session.kind))}</Text>
          {session.sourceName ? (
            <Text variant="meta">{t('activity:workout.from', { source: session.sourceName })}</Text>
          ) : null}
          <Text variant="displayMd" className="pt-1 text-hibiscus-ink">
            {t('activity:unit.kcal', { value: count(session.activeKcal) })}
          </Text>
        </View>
      </Card>

      {rows.map((row) => (
        <View key={row[0].key} className="flex-row gap-md">
          {row.map((stat) => (
            <StatTile key={stat.key} className="flex-1" label={stat.label} value={stat.value} />
          ))}
          {/* A short last row keeps its column width instead of stretching to
              fill it — five tiles are three and two, not three and two halves.
              Only when there is a row above to line up with: a session with a
              time and nothing else gets one tile the width of the screen
              rather than a third of one and a gap. */}
          {rows.length > 1
            ? Array.from({ length: 3 - row.length }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a spacer has no identity
                <View key={index} className="flex-1" />
              ))
            : null}
        </View>
      ))}

      {/* Drawn only when there is something to draw. See the header. */}
      {zones && zoneTotal > 0 ? (
        <Card title={t('activity:workout.zonesTitle')}>
          <View className="gap-3.5">
            {/* One bar, four bands, then the durations as rows. The bar carries
                the proportion and the rows carry the numbers — the same
                arrangement as the burn split on the balance screen, and for the
                same reason: Easy is usually most of it and Peak is a sliver. */}
            <View className="h-4 flex-row overflow-hidden rounded-full bg-track">
              {ZONE_ORDER.map((name) =>
                zones[name] / zoneTotal < 0.01 ? null : (
                  <View
                    key={name}
                    className={ZONE_FILL[name]}
                    style={{ flexGrow: zones[name] / zoneTotal, flexBasis: 0 }}
                  />
                ),
              )}
            </View>

            <View className="gap-2.5">
              {ZONE_ORDER.map((name) => (
                <View key={name} className="flex-row items-center gap-md">
                  <View className={`h-3 w-3 rounded-full ${ZONE_FILL[name]}`} />
                  <Text variant="bodyStrong" className="flex-1">
                    {t(ZONE_KEY[name])}
                  </Text>
                  <Text variant="label" className="text-heading">
                    {clock(zones[name])}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Card>
      ) : null}
    </Screen>
  )
}

/**
 * The tiles, three across.
 *
 * Three is what fits: `StatTile` shrinks its value to one line, and a fourth
 * column on a 393pt screen shrinks "1:59:12" past reading.
 */
function rowsOfThree(stats: readonly Stat[]): Stat[][] {
  const rows: Stat[][] = []
  for (let index = 0; index < stats.length; index += 3) {
    rows.push(stats.slice(index, index + 3))
  }
  return rows
}

/**
 * Cool to hot, using the palette's existing roles rather than a gradient.
 *
 * Water for Easy through hibiscus for Peak. Never a colour literal — see the
 * design system README.
 */
const ZONE_FILL: Record<ZoneName, string> = {
  easy: 'bg-water',
  steady: 'bg-pandan',
  hard: 'bg-kaya',
  peak: 'bg-hibiscus',
}
