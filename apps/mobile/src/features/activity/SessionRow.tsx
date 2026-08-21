import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import type { ActivitySession } from '@/data'
import { datePattern } from '@/lib/dates'
import { useThemeColors } from '@/theme/useTheme'
import { cn, Icon, Tappable, Text } from '@/ui'
import { count, distance, duration } from './format'
import { showsDistance, workoutIcon, workoutKindKey } from './workoutKind'

export type SessionRowProps = {
  session: ActivitySession
  /**
   * "Today", "Yesterday", "Wed" — supplied rather than derived, because the
   * Activity tab shows a time and History shows a day, and the row should not
   * have to know which list it is in.
   */
  dayLabel?: string
  onPress?: () => void
  divider?: boolean
}

/**
 * One workout, on a list.
 *
 * The subtitle is assembled from whatever the session actually has, in a fixed
 * order — when, how long, how far — and joined with the separator the rest of
 * the app uses for this. Distance is dropped for the kinds where it means
 * nothing (see `showsDistance`), which is why "Badminton · 45 min" has two
 * parts and "Morning run" has three.
 *
 * Not a `ListRow`: the trailing slot here is a number AND a unit AND a chevron,
 * and `ListRow` gives up its chevron as soon as anything is passed to it.
 */
export function SessionRow({ session, dayLabel, onPress, divider = true }: SessionRowProps) {
  // The namespace is an ARRAY because `workoutKindKey` returns a prefixed key
  // (`activity:kind.run`), and the typed `t` only accepts prefixed keys when it
  // was given a list of namespaces. Same arrangement as the Trends panels.
  const { t } = useTranslation(['activity', 'common'])
  const colors = useThemeColors()

  const title = session.kindLabel ?? t(workoutKindKey(session.kind))

  const parts = [
    dayLabel ?? format(parseISO(session.startedAt), datePattern('time')).toLowerCase(),
    duration(session.durationS),
  ]
  const far = showsDistance(session.kind) ? distance(session.distanceM) : null
  if (far) parts.push(far)

  const content = (
    // `gap-3` and a 28pt icon rather than `gap-md` and 34, which is the
    // difference between "Yesterday · 52 min · 19.4 km" fitting and ellipsising
    // to "19.4 k...". The subtitle is the widest string a row can carry — a
    // named day, a duration and a distance — and losing its last unit is worse
    // than losing three points of illustration.
    <View
      className={cn(
        'min-h-sm flex-row items-center gap-3 py-3.5',
        divider && 'border-b-2 border-track',
      )}
    >
      <Icon {...workoutIcon(session.kind)} size={28} />

      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="meta" numberOfLines={1}>
          {parts.join(' · ')}
        </Text>
      </View>

      {/* The calorie figure and its unit stack, right aligned. The number is
          what the eye is scanning for down the column, so it keeps the larger
          size and the unit sits under it rather than beside it — beside it, the
          columns of numbers stop lining up as soon as one session breaks 1,000. */}
      <View className="items-end">
        <Text className="font-display text-[20px] text-heading">{count(session.activeKcal)}</Text>
        <Text variant="micro">kcal</Text>
      </View>

      {onPress ? <Icon set="ui" name="chevron-right" size={20} tintColor={colors.faint} /> : null}
    </View>
  )

  if (!onPress) return content

  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={`${parts.join(', ')}, ${count(session.activeKcal)} kcal`}
    >
      {content}
    </Tappable>
  )
}
