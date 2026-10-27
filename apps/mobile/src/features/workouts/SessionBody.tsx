import { format, parseISO } from 'date-fns'
import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useProfile, type WorkoutDetail, type WorkoutEntry } from '@/data'
import { HeartRateCard } from '@/features/activity'
import { datePattern } from '@/lib/dates'
import { ageFrom } from '@/lib/nutrition'
import { UNIT_KEY, type WeightUnit } from '@/lib/units'
import { Badge, Card, cn, Divided, Icon, Tappable, Text } from '@/ui'
import { burnNote } from './burn'
import { RowChevron, Stat, StatGrid } from './cards'
import { setBadges } from './copy'
import { ExerciseArt } from './ExerciseArt'
import { describeSet, distanceUnitFor, durationText, volumeText } from './format'
import { groupSplit, useExerciseLibrary } from './library'
import { MuscleSplitBars } from './MuscleSplit'
import { showsVolume } from './model'
import { PulseLine, traceZones } from './PulseLine'

/*
 * A finished workout's page below its header: its figures, then its exercises
 * set by set. The owner's own page draws it, and so does a group member's view
 * of someone else's workout, which passes `owner={false}`: the burn note and
 * the heart-rate zones then do not lean on the viewer's own profile.
 */

export function SessionFigures({
  workout,
  unit,
  owner = true,
}: {
  workout: WorkoutDetail
  unit: WeightUnit
  /** Someone else's workout: their age is not the viewer's, so zones go without it. */
  owner?: boolean
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const library = useExerciseLibrary()
  const started = parseISO(workout.startedAt)
  const ownBirthDate = useProfile().data?.birth_date ?? null
  const birthDate = owner ? ownBirthDate : null
  const heart = workout.heartRate ?? null
  // A trace means the watch recorded it, and the burn is what it measured (the
  // edit screen's rule too). Anything else is the estimate the phone saved.
  const burnSource = heart ? 'watch' : 'estimate'
  const note = burnNote(t, burnSource, true)
  const zones = useMemo(
    () => (heart ? traceZones(heart, birthDate ? ageFrom(birthDate) : null) : null),
    [heart, birthDate],
  )

  const split = useMemo(
    () =>
      groupSplit(
        workout.entries.map((entry) => ({
          exerciseId: entry.exerciseId,
          sets: entry.sets.filter((set) => set.kind !== 'warmup').length,
        })),
        library.byId,
      ),
    [workout.entries, library.byId],
  )

  return (
    <>
      <Card contentClassName="gap-4">
        <Text variant="meta">
          {format(started, `${datePattern('weekdayDayMonth')}, ${datePattern('time')}`)}
        </Text>
        <StatGrid>
          <Stat label={t('workouts:logger.duration')} value={durationText(t, workout.durationS)} />
          {workout.kcal ? (
            <Stat
              label={t('workouts:detail.kcalLabel')}
              value={t('workouts:detail.kcal', { value: workout.kcal.toLocaleString() })}
              info={note}
            />
          ) : null}
          {/* A bodyweight session is a weighted exercise with nothing added. */}
          {showsVolume(workout.entries.map((entry) => entry.tracking)) && workout.volumeKg > 0 ? (
            <Stat
              label={t('workouts:logger.volume')}
              value={volumeText(t, workout.volumeKg, unit)}
            />
          ) : null}
          <Stat label={t('workouts:logger.sets')} value={String(workout.setCount)} />
          {workout.prCount > 0 ? (
            <Stat
              label={t('workouts:detail.records')}
              value={String(workout.prCount)}
              icon={{ set: 'system', name: 'trophy' }}
            />
          ) : null}
        </StatGrid>
        {workout.notes ? <Text variant="body">{workout.notes}</Text> : null}
      </Card>

      {heart && heart.avgBpm !== null ? (
        <HeartRateCard
          avgHr={heart.avgBpm}
          maxHr={heart.maxBpm}
          zones={zones}
          chart={<PulseLine heart={heart} />}
        />
      ) : null}

      {split.length ? (
        <Card title={t('workouts:detail.muscles')}>
          <MuscleSplitBars rows={split} />
        </Card>
      ) : null}
    </>
  )
}

export function SessionExercises({ workout, unit }: { workout: WorkoutDetail; unit: WeightUnit }) {
  const router = useRouter()
  const library = useExerciseLibrary()
  const distanceUnit = distanceUnitFor(unit)

  return (
    <>
      {workout.entries.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          category={library.byId(entry.exerciseId)?.category}
          unit={unit}
          distanceUnit={distanceUnit}
          onOpen={() =>
            router.push({ pathname: '/workout/exercise/[id]', params: { id: entry.exerciseId } })
          }
        />
      ))}
    </>
  )
}

function EntryCard({
  entry,
  category,
  unit,
  distanceUnit,
  onOpen,
}: {
  entry: WorkoutEntry
  category: Parameters<typeof ExerciseArt>[0]['category']
  unit: WeightUnit
  distanceUnit: ReturnType<typeof distanceUnitFor>
  onOpen: () => void
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const badges = setBadges(entry.sets, t)

  return (
    <Card contentClassName="gap-3 px-4 py-4">
      <Tappable
        className="flex-row items-center gap-3"
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={entry.name}
      >
        <ExerciseArt exerciseId={entry.exerciseId} category={category} size={52} />
        <View className="min-w-0 flex-1">
          <Text variant="bodyStrong" numberOfLines={2}>
            {entry.name}
          </Text>
          {entry.notes ? (
            <Text variant="meta" numberOfLines={3}>
              {entry.notes}
            </Text>
          ) : null}
        </View>
        <RowChevron />
      </Tappable>
      <View>
        <Divided>
          {entry.sets.map((set, index) => (
            <View key={set.id} className="min-h-[40px] flex-row items-center gap-3 py-1.5">
              <Text
                className={cn('w-[24px] text-center font-display text-[16px]', badges[index].tone)}
              >
                {badges[index].label}
              </Text>
              <Text variant="bodyStrong" className="flex-1">
                {describeSet(set, entry.tracking, unit, distanceUnit, t(UNIT_KEY[unit]))}
              </Text>
              {set.rpe !== null ? (
                <Text variant="caption">{t('workouts:logger.rpeValue', { value: set.rpe })}</Text>
              ) : null}
              {set.records.length ? (
                <Badge tone="kaya" size="sm" className="gap-1 self-center">
                  <Icon set="system" name="trophy" size={14} />
                  <Text variant="caption" className="text-kaya-ink">
                    {set.records.length}
                  </Text>
                </Badge>
              ) : null}
            </View>
          ))}
        </Divided>
      </View>
    </Card>
  )
}
