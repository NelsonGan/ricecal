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
import { type Stat, StatRow } from '@/features/shared'
import { datePattern } from '@/lib/dates'
import { ZONE_KEY, ZONE_ORDER, type ZoneName } from '@/lib/health'
import { useBack } from '@/lib/navigation'
import { AppBar, Card, EmptyState, Icon, Screen, Skeleton, Text } from '@/ui'

/**
 * A3 / N4: one workout.
 *
 * The screen is the same on both platforms and the DIFFERENCE between them is
 * the point of its lower half. A watch writing per-minute heart rate produces
 * four zone bands; Strava writing one session average produces none, and the
 * empty state there names the app and says what would fix it. Hiding the
 * section on Android would have been easier and would have left an Android user
 * assuming the feature does not exist.
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

  // Assembled rather than a fixed three, because a badminton game has no
  // distance and a treadmill run has no speed worth printing. A tile row that
  // renders a dash for two of its three columns says nothing.
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

  const heart: Stat[] = []
  if (session.avgHr) {
    heart.push({
      key: 'avg-hr',
      label: t('activity:workout.avgHr'),
      value: t('activity:workout.bpm', { value: session.avgHr }),
    })
  }
  if (session.maxHr) {
    heart.push({
      key: 'max-hr',
      label: t('activity:workout.maxHr'),
      value: t('activity:workout.bpm', { value: session.maxHr }),
    })
  }
  if (session.elevationM != null) {
    heart.push({
      key: 'elevation',
      label: t('activity:workout.elevation'),
      value: t('activity:workout.metres', { value: session.elevationM }),
    })
  }

  const zones = session.hrZones
  const zoneTotal = zones ? ZONE_ORDER.reduce((sum, name) => sum + zones[name], 0) : 0

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

      <StatRow stats={stats} />

      <Card title={t('activity:workout.zonesTitle')}>
        {zones && zoneTotal > 0 ? (
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
        ) : session.avgHr ? (
          // There IS a reading, just one of them. The copy names the writing app
          // where we know it, because the fix — record with something that
          // writes a sample a minute — only makes sense once you know which app
          // to replace.
          <View className="gap-1">
            <Text variant="bodyStrong">{t('activity:workout.zonesNone')}</Text>
            <Text variant="meta">
              {session.sourceName
                ? t('activity:workout.zonesNoneBody', { source: session.sourceName })
                : t('activity:workout.zonesNoneBodyGeneric')}
            </Text>
          </View>
        ) : (
          /**
           * No heart rate at all — not "one average". The screen used to say
           * "Session average only, no zones" here, which described an average it
           * was not showing and the store had never sent: this branch is a phone
           * -logged session, or a treadmill entered by hand, and it has no pulse
           * data of any kind. The rest of the screen agrees — there is no AVG HR
           * tile below, because there is no average.
           */
          <View className="gap-1">
            <Text variant="bodyStrong">{t('activity:workout.noHeartRate')}</Text>
            <Text variant="meta">
              {session.sourceName
                ? t('activity:workout.noHeartRateBody', { source: session.sourceName })
                : t('activity:workout.noHeartRateBodyGeneric')}
            </Text>
          </View>
        )}
      </Card>

      {heart.length > 0 ? <StatRow stats={heart} /> : null}
    </Screen>
  )
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
