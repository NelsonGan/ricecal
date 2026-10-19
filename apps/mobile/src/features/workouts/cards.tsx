import { format, parseISO } from 'date-fns'
import { Children, memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { IconRef, Routine, WorkoutOverview, WorkoutSummary } from '@/data'
import { datePattern } from '@/lib/dates'
import type { WeightUnit } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import { Badge, Button, Card, cn, FLOAT_SHADOW, Icon, Skeleton, Tappable, Text } from '@/ui'
import { ExerciseArt } from './ExerciseArt'
import { durationText, volumeText } from './format'
import { useExerciseLibrary } from './library'

/**
 * The week so far: how many workouts, how long and how much lifted, on the
 * progress page above the bars they come from. A week rather than a day
 * because nobody trains every day and a daily figure would read as a miss four
 * days out of seven. The week streak is not here: it rides beside the
 * Workouts title, as the day streak does on Today.
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
        <Skeleton className="h-[64px] w-full" />
      </Card>
    )
  }
  // Nothing to say (the request failed, or the phone is offline with nothing
  // cached): no card, rather than a skeleton that never resolves.
  if (!overview) return null

  return (
    <Card title={t('workouts:overview.title')}>
      <View className="flex-row gap-2.5">
        <Tile
          icon={<Icon set="body" name="stopwatch" size={22} />}
          label={t('workouts:overview.workouts')}
          value={String(overview.thisWeekWorkouts)}
        />
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
    </Card>
  )
}

/** A figure over its name, with an icon above both: three of them fit a row. */
function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 gap-1 rounded-md bg-surface-alt px-3 py-2.5">
      {icon}
      <Text variant="label" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/**
 * The week streak as a pill, for beside the Workouts title: the same pill
 * Today puts beside its date for the day streak. Nothing until the count is
 * known, because "0 week streak" is the wrong sentence about somebody whose
 * request is still out.
 */
export function WeekStreakBadge({ weeks }: { weeks: number | undefined }) {
  const { t } = useTranslation(['workouts'])
  if (weeks === undefined) return null
  return (
    <Badge tone="kaya">
      <Icon set="body" name="flame-burn" size={18} />
      <Text variant="caption" className="text-kaya-ink">
        {t('workouts:overview.streak', { count: weeks })}
      </Text>
    </Badge>
  )
}

/**
 * One routine: its first exercise's drawing, its name on one line, when it was
 * last done as a badge, and Start on the right, which is the whole reason the
 * row exists; under them, what it holds, as up to two lines of exercise
 * names. The name is a size down from a card title so more of it fits, and the
 * exercises say what a routine is when the name does not.
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
  const last = routine.lastUsedAt ? parseISO(routine.lastUsedAt) : null
  // The year only when it is not this one, as a diary date would.
  const date = last
    ? format(
        last,
        datePattern(last.getFullYear() === new Date().getFullYear() ? 'dayMonth' : 'dayMonthYear'),
      )
    : null
  const when = date ? t('workouts:routines.lastDone', { date }) : t('workouts:routines.never')
  // Names as saved: they stay English in every language (see the catalogue),
  // so a plain comma joins them everywhere.
  const exercises = routine.exercises.map((exercise) => exercise.exercise_name).join(', ')
  const start = t('workouts:start.routine')

  return (
    <Card
      contentClassName="gap-2 p-3"
      onPress={onOpen}
      // The card is one element to VoiceOver, which hides the Start button
      // inside it, so Start is offered as the card's own action instead.
      accessibilityRole="button"
      accessibilityLabel={[routine.name, when, exercises].filter(Boolean).join(', ')}
      accessibilityActions={[{ name: 'start', label: start }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'start') onStart()
      }}
    >
      <View className="flex-row items-center gap-3">
        <ExerciseArt
          exerciseId={first?.exercise_id ?? ''}
          category={first ? library.byId(first.exercise_id)?.category : undefined}
          size={44}
        />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="label" numberOfLines={1}>
            {routine.name}
          </Text>
          {date ? (
            <Metric icon={<Icon set="system" name="calendar" size={16} />} text={date} />
          ) : null}
        </View>
        <Button size="sm" onPress={onStart}>
          {start}
        </Button>
      </View>
      {exercises ? (
        <Text variant="meta" numberOfLines={2}>
          {exercises}
        </Text>
      ) : null}
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

/**
 * A past workout in the history list. Memoised with the workout handed to
 * `onPress`, so the list re-renders only the cards that changed rather than
 * every one loaded.
 */
export const WorkoutCard = memo(function WorkoutCard({
  workout,
  unit,
  onPress,
}: {
  workout: WorkoutSummary
  unit: WeightUnit
  onPress: (workout: WorkoutSummary) => void
}) {
  const { t } = useTranslation(['workouts', 'common'])

  return (
    <Card contentClassName="gap-3 p-4" onPress={() => onPress(workout)}>
      <WorkoutHeading
        exerciseId={workout.exercises[0]?.exerciseId}
        name={workout.name}
        startedAt={workout.startedAt}
      >
        <RowChevron />
      </WorkoutHeading>

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
})

/**
 * A shared workout, as a feed post draws it where a meal post has its photo:
 * the name and when, the figures people compare (time, volume, sets, records),
 * and what was done. Never the notes, which stay the author's.
 */
export function WorkoutPreview({
  name,
  startedAt,
  durationS,
  volumeKg,
  sets,
  records,
  exercises,
  unit,
}: {
  name: string
  startedAt: string
  durationS: number
  volumeKg: number
  sets: number
  records: number
  exercises: readonly { exerciseId: string; name: string; sets: number }[]
  unit: WeightUnit
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const library = useExerciseLibrary()
  const shown = exercises.slice(0, 4)

  return (
    <View className="gap-4 bg-surface-alt px-5 py-5">
      <WorkoutHeading
        large
        exerciseId={exercises[0]?.exerciseId}
        name={name}
        startedAt={startedAt}
      />

      <StatStrip>
        <Stat label={t('workouts:logger.duration')} value={durationText(t, durationS)} />
        {volumeKg > 0 ? (
          <Stat label={t('workouts:logger.volume')} value={volumeText(t, volumeKg, unit)} />
        ) : (
          <Stat label={t('workouts:logger.sets')} value={String(sets)} />
        )}
        {records > 0 ? (
          <Stat
            label={t('workouts:detail.records')}
            value={String(records)}
            icon={{ set: 'system', name: 'trophy' }}
          />
        ) : null}
      </StatStrip>

      {shown.length ? (
        <View className="gap-2">
          {shown.map((exercise, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a workout may repeat an exercise
            <View key={index} className="flex-row items-center gap-2.5">
              <ExerciseArt
                exerciseId={exercise.exerciseId}
                category={library.byId(exercise.exerciseId)?.category}
                size={32}
              />
              <Text variant="label" className="min-w-0 flex-1" numberOfLines={1}>
                {t('workouts:history.exerciseLine', { sets: exercise.sets, name: exercise.name })}
              </Text>
            </View>
          ))}
          {exercises.length > shown.length ? (
            <Text variant="caption">
              {t('workouts:history.moreExercises', { count: exercises.length - shown.length })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

/**
 * A workout's first exercise drawn, then its name and when it started: a
 * history card's top line, and larger, a shared workout's.
 */
function WorkoutHeading({
  exerciseId,
  name,
  startedAt,
  large = false,
  children,
}: {
  exerciseId: string | undefined
  name: string
  startedAt: string
  large?: boolean
  children?: ReactNode
}) {
  const library = useExerciseLibrary()
  return (
    <View className="flex-row items-center gap-3">
      {exerciseId ? (
        <ExerciseArt
          exerciseId={exerciseId}
          category={library.byId(exerciseId)?.category}
          size={large ? 56 : 52}
        />
      ) : null}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant={large ? 'subtitle' : 'bodyStrong'} numberOfLines={large ? 2 : 1}>
          {name}
        </Text>
        <Text variant="meta" numberOfLines={1}>
          {format(parseISO(startedAt), `${datePattern('weekdayDayMonth')}, ${datePattern('time')}`)}
        </Text>
      </View>
      {children}
    </View>
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
 * and sets, and a shared workout's. Each child is one `Stat`, or a component
 * that renders one, so a clock can re-render its own figure each second and
 * nothing else.
 *
 * More than four do not fit a phone's width: with a watch's heart rate and
 * burn beside the other three, every label cut off ("DUR…", "KC…"). Then the
 * strip is two rows of three columns, the watch's figures underneath.
 */
export function StatStrip({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean)
  const perRow = items.length > STRIP_MAX ? 3 : items.length
  const rows: ReactNode[][] = []
  for (let at = 0; at < items.length; at += perRow) rows.push(items.slice(at, at + perRow))
  return (
    <View className="rounded-card bg-surface py-3">
      {rows.map((row, rowIndex) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: the strip's order is its layout
          key={rowIndex}
          className={cn('flex-row', rowIndex > 0 && 'mt-3 border-line border-t pt-3')}
        >
          {row.map((child, index) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: the strip's order is its layout
              key={index}
              className={cn(
                // Four across, each column starts from its own width and shares
                // what is left, so "DURATION" is not cut to fit "SETS"; it can
                // still shrink, or a long language runs off the card.
                rows.length > 1 ? 'w-1/3' : perRow > 3 ? 'shrink grow basis-auto' : 'flex-1',
                perRow > 3 ? 'px-3' : 'px-4',
                index > 0 && 'border-line border-l',
              )}
            >
              {child}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

/** The most figures one row of a `StatStrip` holds on a phone. */
const STRIP_MAX = 4

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

export function Stat({
  label,
  value,
  icon,
  leading,
  onPress,
  accessibilityHint,
}: {
  label: string
  value: string
  icon?: IconRef
  /** Drawn where the icon goes, for one that moves (`LiveHeart`). */
  leading?: ReactNode
  /** A figure with something to say about where it came from (`StatNote`). */
  onPress?: () => void
  accessibilityHint?: string
}) {
  const body = (
    <View className="gap-0.5">
      <View className="flex-row items-center gap-1">
        <Text variant="overlineSm" numberOfLines={1} className="shrink">
          {label}
        </Text>
        {onPress ? <Icon set="ui" name="info" size={12} /> : null}
      </View>
      <View className="flex-row items-center gap-1">
        {leading ?? (icon ? <Icon {...icon} size={18} /> : null)}
        <Text variant="numeric" numberOfLines={1} adjustsFontSizeToFit className="shrink">
          {value}
        </Text>
      </View>
    </View>
  )
  if (!onPress) return body
  return (
    <Tappable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityHint={accessibilityHint}
    >
      {body}
    </Tappable>
  )
}

/**
 * What a figure in a `StatStrip` or `StatGrid` is made of, opened by tapping
 * it: the app has no tooltip, so the note opens in the flow under the figures
 * rather than floating over the sets.
 */
export function StatNote({
  text,
  onClose,
  inCard = false,
}: {
  text: string
  onClose: () => void
  /** On a card's own surface, where the logger's fill would not show. */
  inCard?: boolean
}) {
  return (
    <Tappable onPress={onClose} haptics={false} accessibilityRole="text">
      <View
        className={cn(
          'flex-row items-center gap-2 rounded-card px-4 py-2.5',
          inCard ? 'bg-surface-alt' : 'bg-surface',
        )}
      >
        <Icon set="ui" name="info" size={16} />
        <Text variant="caption" className="flex-1">
          {text}
        </Text>
      </View>
    </Tappable>
  )
}

/** Figures that count keep their width, so nothing beside them shuffles each second. */
const TABULAR = { fontVariant: ['tabular-nums' as const] }

/**
 * The minimised workout, over the tab bar on every tab while one runs.
 *
 * Drawn as part of the bar's layer (its surface and shadow) rather than as
 * another card, and with one figure on the right at a time: the rest, when
 * one is counting down, since that is what someone on another tab is waiting
 * for. It used to carry a caption, the name, the rest and the clock in a row,
 * two figures side by side in two sizes, which read as clutter.
 */
export function ActiveWorkoutBar({
  name,
  elapsed,
  rest,
  onPress,
}: {
  name: string
  /** "12:04", already formatted. */
  elapsed: string
  /** The countdown ("1:12") and the share of it still to go, while a rest runs. */
  rest: { left: string; progress: number } | null
  onPress: () => void
}) {
  const { t } = useTranslation('workouts')

  return (
    // The shadow on a layer of its own: iOS drops the shadow of anything that
    // clips, and the bar clips the rest line to its corners.
    <View className="rounded-card bg-surface" style={FLOAT_SHADOW}>
      <Tappable
        onPress={onPress}
        className="overflow-hidden rounded-card border border-line"
        accessibilityRole="button"
        accessibilityLabel={`${t('start.resume')}: ${name}`}
      >
        <View className="flex-row items-center gap-3 py-2.5 pl-2.5 pr-3.5">
          <View className="h-9 w-9 items-center justify-center rounded-md bg-pandan-soft">
            <Icon set="body" name="dumbbell" size={24} />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="label" numberOfLines={1}>
              {name}
            </Text>
            <View className="flex-row items-center gap-1.5">
              {/* The dot says "live" where a caption used to spell it out. */}
              <View className="h-1.5 w-1.5 rounded-full bg-pandan" />
              <Text variant="caption" style={TABULAR}>
                {elapsed}
              </Text>
            </View>
          </View>
          {rest ? (
            <View className="flex-row items-center gap-1 rounded-full bg-kaya-soft py-1 pl-2 pr-2.5">
              <Icon set="system" name="clock" size={16} />
              <Text variant="label" className="text-kaya-ink" style={TABULAR}>
                {rest.left}
              </Text>
            </View>
          ) : null}
        </View>
        {rest ? (
          <View
            className="absolute bottom-0 left-0 h-[3px] bg-kaya"
            style={{ width: `${rest.progress * 100}%` }}
          />
        ) : null}
      </Tappable>
    </View>
  )
}
