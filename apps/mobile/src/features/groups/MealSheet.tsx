import { format, parseISO } from 'date-fns'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useUserId } from '@/data'
import { type BoardEntry, type BoardMember, GROUP_MEALS, type GroupMeal } from '@/data/groups'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { Chip, cn, Sheet, Tappable, Text } from '@/ui'
import { EntryPicture, MEAL_TINT, useGroupTask } from './parts'

/**
 * One member's meal: every food in it, with its numbers. A friend's food takes
 * a like or a dislike; your own can move to another column, which moves it in
 * every group you are in.
 */
export function MealSheet({
  groupId,
  day,
  meal,
  member,
  name,
  onClose,
}: {
  groupId: string
  day: string
  meal: GroupMeal | null
  member: BoardMember | null
  name: string
  onClose: () => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const viewer = useUserId()
  const visible = meal !== null && member !== null
  // What the sheet was showing, kept while it slides away so its title does not
  // change to an empty breakfast on the way out.
  const shown = useRef<{ meal: GroupMeal; member: BoardMember; name: string } | null>(null)
  if (visible) shown.current = { meal, member, name }
  const current = shown.current
  const entries = current?.member.entries.filter((entry) => entry.meal === current.meal) ?? []
  const isSelf = current?.member.person.id === viewer

  // Moving the last food out of this meal, or it being deleted, leaves
  // nothing to show: close rather than sit open and empty.
  const empty = visible && entries.length === 0
  useEffect(() => {
    if (empty) onClose()
  }, [empty, onClose])

  const kcal = entries.reduce((sum, entry) => sum + entry.kcal, 0)
  const inSentence = current ? t(`mealInSentence.${current.meal}`) : ''
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={
        isSelf
          ? t('yourMeal', { meal: inSentence })
          : t('mealOf', { name: current?.name ?? '', meal: inSentence })
      }
      description={`${kcal} ${t('common:unit.kcal')} · ${t('foods', { count: entries.length })}`}
    >
      <View className="gap-3">
        {entries.map((entry) => (
          <EntryRow
            key={entry.id}
            groupId={groupId}
            day={day}
            entry={entry}
            ownerId={current?.member.person.id ?? ''}
            isSelf={isSelf}
          />
        ))}
      </View>
    </Sheet>
  )
}

function EntryRow({
  groupId,
  day,
  entry,
  ownerId,
  isSelf,
}: {
  groupId: string
  day: string
  entry: BoardEntry
  ownerId: string
  isSelf: boolean
}) {
  const { t } = useTranslation(['groups', 'common'])
  const task = useGroupTask()
  const react = (value: -1 | 1) => {
    const next = entry.mine === value ? 0 : value
    task.press({ action: 'react', groupId, day, entryId: entry.id, value: next })
    if (next !== 0) track('Group Reaction Set', { reaction: next === 1 ? 'like' : 'dislike' })
  }
  const grams = (value: number) => t('common:unit.grams', { value: Math.round(value) })
  return (
    <View className="gap-2.5 rounded-tile border border-line bg-surface p-2.5">
      <View className="flex-row gap-3">
        <View
          className={cn(
            'h-[72px] w-[72px] overflow-hidden rounded-[14px]',
            !entry.photo_path && MEAL_TINT[entry.meal],
          )}
        >
          <EntryPicture entry={entry} ownerId={ownerId} iconSize={44} />
        </View>
        <View className="min-w-0 flex-1 justify-center gap-0.5">
          <Text variant="label" numberOfLines={2}>
            {entry.name}
          </Text>
          <Text variant="meta" numberOfLines={1}>
            {[entry.serving_label, format(parseISO(entry.logged_at), datePattern('time'))]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text variant="caption" className="text-ink">
            {entry.kcal} {t('common:unit.kcal')}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {t('common:macro.carbs')} {grams(entry.carbs_g)} · {t('common:macro.protein')}{' '}
            {grams(entry.protein_g)} · {t('common:macro.fat')} {grams(entry.fat_g)}
          </Text>
        </View>
      </View>
      {isSelf ? (
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text variant="caption">{t('moveTo')}</Text>
            {entry.likes > 0 || entry.dislikes > 0 ? (
              <Text variant="caption">
                👍 {entry.likes} 👎 {entry.dislikes}
              </Text>
            ) : null}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {GROUP_MEALS.map((meal) => (
              <Chip
                key={meal}
                selected={entry.meal === meal}
                onPress={() =>
                  entry.meal !== meal && task.press({ action: 'move', entryId: entry.id, meal })
                }
              >
                {t(`common:meal.${meal}`)}
              </Chip>
            ))}
          </View>
        </View>
      ) : (
        <View className="flex-row gap-2">
          <Reaction
            label={t('like')}
            emoji="👍"
            count={entry.likes}
            selected={entry.mine === 1}
            onPress={() => react(1)}
          />
          <Reaction
            label={t('dislike')}
            emoji="👎"
            count={entry.dislikes}
            selected={entry.mine === -1}
            onPress={() => react(-1)}
          />
        </View>
      )}
    </View>
  )
}

function Reaction({
  label,
  emoji,
  count,
  selected,
  onPress,
}: {
  label: string
  emoji: string
  count: number
  selected: boolean
  onPress: () => void
}) {
  return (
    <Tappable
      haptics
      className={cn(
        'min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-full border',
        selected ? 'border-pandan bg-pandan-soft' : 'border-line bg-surface',
      )}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${count}`}
    >
      <Text variant="label">{emoji}</Text>
      <Text variant="label" className={selected ? 'text-pandan-ink' : 'text-ink'}>
        {label} · {count}
      </Text>
    </Tappable>
  )
}
