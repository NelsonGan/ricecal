import { format, parseISO } from 'date-fns'
import { Children, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { IconRef, Routine, WorkoutOverview, WorkoutSummary } from '@/data'
import { datePattern } from '@/lib/dates'
import type { WeightUnit } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import { Badge, Button, Card, cn, Icon, Skeleton, Tappable, Text } from '@/ui'
import { ExerciseArt } from './ExerciseArt'
import { durationText, volumeText } from './format'
import { useExerciseLibrary } from './library'

/**
 * The week so far: how many workouts, how long, how much lifted, and the
 * streak of weeks. A week rather than a day because nobody trains every day
 * and a daily figure would read as a miss four days out of seven.
 */
export function OverviewCard({
  overview,
  unit,
  loading,
}: {
  overview: WorkoutOverview | undefined
  unit: WeightUnit
  loading: boolean
}) {
  const { t } = useTranslation(['workouts', 'common'])

  if (loading) {
    return (
      <Card>
        <Skeleton className="h-[148px] w-full" />
      </Card>
    )
  }
  // Nothing to say (the request failed, or the phone is offline with nothing
  // cached): no card, rather than a skeleton that never resolves above the
  // buttons that still work.
  if (!overview) return null

  return (
    <Card contentClassName="gap-4">
      <View className="flex-row items-center gap-3">
        <Text className="font-display text-[56px] leading-[76px] text-heading">
          {overview.thisWeekWorkouts}
        </Text>
        <Text variant="subtitle" className="flex-1">
          {t('workouts:overview.thisWeek', { count: overview.thisWeekWorkouts })}
        </Text>
        <Icon set="scenes" name="dumbbell" size={72} />
      </View>
      <View className="flex-row gap-2.5">
        <Tile
          icon={<Icon set="system" name="clock" size={22} />}
          label={t('workouts:overview.time')}
          value={durationText(t, overview.thisWeekSeconds)}
        />
        <Tile
          icon={<Icon set="body" name="dumbbell" size={22} />}
          label={t('workouts:overview.volume')}
          value={volumeText(t, overview.thisWeekVolumeKg, unit)}
        />
      </View>
      <View className="flex-row items-center justify-center gap-2 rounded-md bg-kaya-soft px-3 py-2.5">
        <Icon set="body" name="flame-burn" size={22} />
        <Text variant="label" className="text-kaya-ink">
          {overview.weekStreak > 0
            ? t('workouts:overview.streak', { count: overview.weekStreak })
            : t('workouts:overview.noStreak')}
        </Text>
      </View>
    </Card>
  )
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View className="flex-1 flex-row items-center gap-2 rounded-md bg-surface-alt px-3 py-2.5">
      {icon}
      <View className="min-w-0 flex-1">
        <Text variant="label" numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  )
}

/**
 * One routine as a row: its first exercise's drawing, its name, how many
 * exercises and when it was last done, and Start, which is the whole reason
 * the row exists. A row rather than a tile, so a long name or a dozen routines
 * read the same way two short ones do.
 */
export function RoutineCard({
  routine,
  onStart,
  onOpen,
}: {
  routine: Routine
  onStart: () => void
  onOpen: () => void
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const first = routine.exercises[0]
  const library = useExerciseLibrary()
  const when = routine.lastUsedAt
    ? t('workouts:routines.lastDone', {
        date: format(parseISO(routine.lastUsedAt), datePattern('dayMonth')),
      })
    : t('workouts:routines.never')
  const exercises = t('workouts:routines.exercises', { count: routine.exercises.length })
  const start = t('workouts:start.routine')

  return (
    <Card
      contentClassName="flex-row items-center gap-3 p-3"
      onPress={onOpen}
      // The card is one element to VoiceOver, which hides the Start button
      // inside it, so Start is offered as the card's own action instead.
      accessibilityRole="button"
      accessibilityLabel={`${routine.name}, ${exercises}, ${when}`}
      accessibilityActions={[{ name: 'start', label: start }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'start') onStart()
      }}
    >
      <ExerciseArt
        exerciseId={first?.exercise_id ?? ''}
        category={first ? library.byId(first.exercise_id)?.category : undefined}
        size={52}
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="bodyStrong" numberOfLines={1}>
          {routine.name}
        </Text>
        <Text variant="meta" numberOfLines={1}>
          {`${exercises} · ${when}`}
        </Text>
      </View>
      <Button size="sm" onPress={onStart}>
        {start}
      </Button>
    </Card>
  )
}

/**
 * The chevron on a card that opens something, tinted as `ListRow` tints its
 * own: it is chrome, and the icon's own blue read as an accent.
 */
export function RowChevron() {
  const colors = useThemeColors()
  return <Icon set="ui" name="chevron-right" size={20} tintColor={colors.faint} />
}

/** A past workout in the history list. */
export function WorkoutCard({
  workout,
  unit,
  onPress,
}: {
  workout: WorkoutSummary
  unit: WeightUnit
  onPress?: () => void
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const first = workout.exercises[0]
  const library = useExerciseLibrary()
  const started = parseISO(workout.startedAt)

  return (
    <Card contentClassName="gap-3 p-4" onPress={onPress}>
      <View className="flex-row items-center gap-3">
        {first ? (
          <ExerciseArt
            exerciseId={first.exerciseId}
            category={library.byId(first.exerciseId)?.category}
            size={52}
          />
        ) : null}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="bodyStrong" numberOfLines={1}>
            {workout.name}
          </Text>
          <Text variant="meta" numberOfLines={1}>
            {format(started, `${datePattern('weekdayDayMonth')}, ${datePattern('time')}`)}
          </Text>
        </View>
        {onPress ? <RowChevron /> : null}
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Metric
          icon={<Icon set="system" name="clock" size={16} />}
          text={durationText(t, workout.durationS)}
        />
        {workout.volumeKg > 0 ? (
          <Metric
            icon={<Icon set="body" name="dumbbell" size={16} />}
            text={volumeText(t, workout.volumeKg, unit)}
          />
        ) : null}
        {workout.prCount > 0 ? (
          <Metric
            icon={<Icon set="system" name="trophy" size={16} />}
            text={t('workouts:history.prs', { count: workout.prCount })}
            tone="kaya"
          />
        ) : null}
        {workout.pending ? <Badge tone="water">{t('workouts:history.pending')}</Badge> : null}
      </View>

      {workout.exercises.length ? (
        <View className="gap-0.5 border-t border-line pt-2.5">
          {workout.exercises.slice(0, 3).map((exercise, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a workout may repeat an exercise
            <Text key={index} variant="meta" numberOfLines={1}>
              {t('workouts:history.exerciseLine', { sets: exercise.sets, name: exercise.name })}
            </Text>
          ))}
          {workout.exercises.length > 3 ? (
            <Text variant="caption">
              {t('workouts:history.moreExercises', { count: workout.exercises.length - 3 })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  )
}

function Metric({ icon, text, tone }: { icon: ReactNode; text: string; tone?: 'kaya' }) {
  return (
    <Badge tone={tone ?? 'neutral'} size="sm">
      {icon}
      <Text variant="caption" className={tone === 'kaya' ? 'text-kaya-ink' : 'text-ink'}>
        {text}
      </Text>
    </Badge>
  )
}

/**
 * A row of figures with thin rules between them: the logger's duration, volume
 * and sets, and the finish screen's. Each child is one `Stat`, or a component
 * that renders one, so a figure that ticks can re-render on its own.
 */
export function StatStrip({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row rounded-card bg-surface py-3">
      {Children.toArray(children).map((child, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: the strip's order is its layout
          key={index}
          className={cn('flex-1 px-4', index > 0 && 'border-line border-l')}
        >
          {child}
        </View>
      ))}
    </View>
  )
}

/** The same figures three to a row, for a summary with more than fit on one line. */
export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row flex-wrap gap-y-3">
      {Children.toArray(children).map((child, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the grid's order is its layout
        <View key={index} className="w-1/3 pr-2">
          {child}
        </View>
      ))}
    </View>
  )
}

export function Stat({ label, value, icon }: { label: string; value: string; icon?: IconRef }) {
  return (
    <View className="gap-0.5">
      <Text variant="overlineSm" numberOfLines={1}>
        {label}
      </Text>
      <View className="flex-row items-center gap-1">
        {icon ? <Icon {...icon} size={18} /> : null}
        <Text variant="numeric" numberOfLines={1} adjustsFontSizeToFit className="shrink">
          {value}
        </Text>
      </View>
    </View>
  )
}

/** The minimised workout, over the tab bar on every tab while one runs. */
export function ActiveWorkoutBar({
  name,
  elapsed,
  resting,
  onPress,
}: {
  name: string
  /** "12:04", already formatted. */
  elapsed: string
  /** "Rest 1:12", when a rest is counting down. */
  resting: string | null
  onPress: () => void
}) {
  const { t } = useTranslation(['workouts', 'common'])

  return (
    <Tappable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-tile border border-pandan-soft-line bg-pandan-soft px-4 py-2.5"
      accessibilityRole="button"
      accessibilityLabel={`${t('workouts:start.resume')}: ${name}`}
    >
      <Icon set="body" name="dumbbell" size={28} />
      <View className="min-w-0 flex-1">
        <Text variant="caption" className="text-pandan-ink">
          {t('workouts:start.running')}
        </Text>
        <Text variant="label" numberOfLines={1}>
          {name}
        </Text>
      </View>
      {resting ? (
        <Text variant="label" className="text-kaya-ink">
          {resting}
        </Text>
      ) : null}
      <Text className="font-display text-[20px] leading-[28px] text-pandan-ink">{elapsed}</Text>
    </Tappable>
  )
}
