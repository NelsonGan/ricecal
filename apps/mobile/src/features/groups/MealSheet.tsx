import { format, parseISO } from 'date-fns'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useUserId } from '@/data'
import { type BoardEntry, type BoardMember, GROUP_MEALS, type GroupMeal } from '@/data/groups'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { cn, Icon, SegmentedControl, Sheet, Tappable, Text } from '@/ui'
import { EntryPicture, MEAL_TINT, useGroupTask } from './parts'

/**
 * One member's meal: every food in it, with its numbers. A friend's food takes
 * a like or a dislike; your own can move to another column, which moves it in
 * every group you are in.
 */
export function MealSheet({
  meal,
  member,
  onClose,
}: {
  meal: GroupMeal | null
  member: BoardMember | null
  onClose: () => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const viewer = useUserId()
  const visible = meal !== null && member !== null
  // What the sheet was showing, kept while it slides away so its cards do not
  // empty out on the way down.
  const shown = useRef<{ meal: GroupMeal; member: BoardMember } | null>(null)
  if (visible) shown.current = { meal, member }
  const current = shown.current
  const entries = current?.member.entries.filter((entry) => entry.meal === current.meal) ?? []
  const isSelf = current?.member.person.id === viewer

  // Moving the last food out of this meal, or it being deleted, leaves
  // nothing to show: close rather than sit open and empty.
  const empty = visible && entries.length === 0
  useEffect(() => {
    if (empty) onClose()
  }, [empty, onClose])

  // No title or total: the tile just tapped says whose meal it is, and each
  // card carries its own figures.
  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t('common:action.close')}>
      <View className="gap-3">
        {entries.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            ownerId={current?.member.person.id ?? ''}
            isSelf={isSelf}
          />
        ))}
      </View>
    </Sheet>
  )
}

/** Carbs, protein and fat, in the order and colours every chart in the app uses. */
const MACROS = [
  { key: 'carbs_g', label: 'common:macro.carbs', chip: 'bg-kaya-soft', dot: 'bg-kaya' },
  { key: 'protein_g', label: 'common:macro.protein', chip: 'bg-hibiscus-soft', dot: 'bg-hibiscus' },
  { key: 'fat_g', label: 'common:macro.fat', chip: 'bg-teh-soft', dot: 'bg-teh' },
] as const

function EntryRow({
  entry,
  ownerId,
  isSelf,
}: {
  entry: BoardEntry
  ownerId: string
  isSelf: boolean
}) {
  const { t } = useTranslation(['groups', 'common'])
  const task = useGroupTask()
  const react = (value: -1 | 1) => {
    const next = entry.mine === value ? 0 : value
    task.press({ action: 'react', entryId: entry.id, value: next })
    if (next !== 0) track('Group Reaction Set', { reaction: next === 1 ? 'like' : 'dislike' })
  }
  const meals = GROUP_MEALS.map((meal) => ({ value: meal, label: t(`common:meal.${meal}`) }))
  return (
    <View className="gap-3 rounded-tile border border-line bg-surface p-3">
      <View className="flex-row gap-3">
        <View
          className={cn(
            'h-[72px] w-[72px] overflow-hidden rounded-[14px]',
            !entry.photo_path && MEAL_TINT[entry.meal],
          )}
        >
          <EntryPicture entry={entry} ownerId={ownerId} iconSize={44} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="label" numberOfLines={2}>
            {entry.name}
          </Text>
          <Text variant="meta" numberOfLines={1}>
            {[entry.serving_label, format(parseISO(entry.logged_at), datePattern('time'))]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-row items-baseline gap-1">
              <Text className="font-display text-[20px] leading-[26px] text-heading">
                {Math.round(entry.kcal).toLocaleString()}
              </Text>
              <Text variant="caption">{t('common:unit.kcal')}</Text>
            </View>
            {/* Beside the figure rather than on a row of their own, which left
                half the card empty. Your own food cannot be reacted to, so
                there it is what friends said instead. */}
            {isSelf ? (
              <Tally likes={entry.likes} dislikes={entry.dislikes} />
            ) : (
              <View className="flex-row gap-2">
                <Reaction
                  label={t('like')}
                  kind="up"
                  count={entry.likes}
                  selected={entry.mine === 1}
                  onPress={() => react(1)}
                />
                <Reaction
                  label={t('dislike')}
                  kind="down"
                  count={entry.dislikes}
                  selected={entry.mine === -1}
                  onPress={() => react(-1)}
                />
              </View>
            )}
          </View>
        </View>
      </View>
      <View className="flex-row gap-2">
        {MACROS.map((macro) => (
          <View
            key={macro.key}
            className={cn(
              'min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-full px-2 py-1.5',
              macro.chip,
            )}
          >
            <View className={cn('h-2 w-2 rounded-full', macro.dot)} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              className="shrink font-body-bold text-[13px] leading-[17px] text-body"
            >
              {t(macro.label)}{' '}
              <Text className="font-body-black text-[13px] leading-[17px] text-ink">
                {t('common:unit.grams', { value: Math.round(entry[macro.key]) })}
              </Text>
            </Text>
          </View>
        ))}
      </View>
      {isSelf ? (
        // No "Move to" label: the meal it is in is the raised segment, and the
        // others are where it can go. A screen reader still hears the label.
        <SegmentedControl
          options={meals}
          value={entry.meal}
          onChange={(meal) =>
            meal !== entry.meal && task.press({ action: 'move', entryId: entry.id, meal })
          }
          accessibilityLabel={t('moveTo')}
          size="sm"
        />
      ) : null}
    </View>
  )
}

/** Likes and dislikes on your own food, only the ones there are. */
function Tally({ likes, dislikes }: { likes: number; dislikes: number }) {
  const { t } = useTranslation('groups')
  const parts = [
    { kind: 'up' as const, count: likes, label: t('like') },
    { kind: 'down' as const, count: dislikes, label: t('dislike') },
  ].filter((part) => part.count > 0)
  if (parts.length === 0) return null
  return (
    <View
      className="flex-row items-center gap-2"
      accessible
      accessibilityLabel={parts.map((part) => `${part.label}, ${part.count}`).join(', ')}
    >
      {parts.map((part) => (
        <View key={part.kind} className="flex-row items-center gap-1">
          <Icon set="system" name={`thumbs-${part.kind}`} size={18} />
          <Text variant="caption" className="text-ink">
            {part.count}
          </Text>
        </View>
      ))}
    </View>
  )
}

/**
 * A compact pill: the hand and the count. The word is for screen readers; a
 * thumb up or down says it on screen.
 *
 * Tapping it bounces the hand, tipping it the way it points, so a reaction
 * reads as given rather than as a number that changed. Taking one back only
 * dips it. Still for anyone who has asked the system for less motion.
 */
function Reaction({
  label,
  kind,
  count,
  selected,
  onPress,
}: {
  label: string
  kind: 'up' | 'down'
  count: number
  selected: boolean
  onPress: () => void
}) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const tilt = useSharedValue(0)
  const hand = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${tilt.value}deg` }],
  }))
  const press = () => {
    if (!reduceMotion) {
      const giving = !selected
      scale.value = withSequence(
        withTiming(giving ? 1.4 : 0.8, { duration: 110, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 7, stiffness: 260 }),
      )
      if (giving) {
        const lean = kind === 'up' ? -18 : 18
        tilt.value = withSequence(
          withTiming(lean, { duration: 110 }),
          withSpring(0, { damping: 6, stiffness: 220 }),
        )
      }
    }
    onPress()
  }
  return (
    <Tappable
      haptics
      // 36pt drawn, 44pt to a finger.
      hitSlop={4}
      className={cn(
        'min-h-[36px] min-w-[60px] flex-row items-center justify-center gap-1.5 rounded-full border-2 px-3',
        selected ? 'border-pandan bg-pandan-soft' : 'border-line bg-surface',
      )}
      onPress={press}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${count}`}
    >
      <Animated.View style={hand}>
        <Icon set="system" name={`thumbs-${kind}`} size={24} />
      </Animated.View>
      <Text
        className={cn(
          'font-body-black text-[15px] leading-[20px]',
          selected ? 'text-pandan-ink' : 'text-ink',
        )}
      >
        {count}
      </Text>
    </Tappable>
  )
}
