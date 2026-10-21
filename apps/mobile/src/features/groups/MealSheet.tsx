import { format, parseISO } from 'date-fns'
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
  open,
  member,
  onClose,
}: {
  groupId: string
  day: string
  open: { meal: GroupMeal; index: number } | null
  member: BoardMember | null
  onClose: () => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const viewer = useUserId()
  const isSelf = member?.person.id === viewer
  const meal = open?.meal ?? 'breakfast'
  const entries = member?.entries.filter((entry) => entry.meal === meal) ?? []
  const kcal = entries.reduce((sum, entry) => sum + entry.kcal, 0)
  const mealName = t(meal).toLowerCase()
  const title = isSelf
    ? t('yourMeal', { meal: mealName })
    : t('mealOf', { name: member?.person.name.split(' ')[0] ?? '', meal: mealName })

  return (
    <Sheet
      visible={open !== null && member !== null}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={title}
      description={`${kcal} kcal · ${t('foods', { count: entries.length })}`}
    >
      <View className="gap-3">
        {entries.map((entry) => (
          <EntryRow
            key={entry.id}
            groupId={groupId}
            day={day}
            entry={entry}
            ownerId={member?.person.id ?? ''}
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
  const { t } = useTranslation('groups')
  const task = useGroupTask()
  const react = (value: -1 | 1) => {
    const next = entry.mine === value ? 0 : value
    task.press({ action: 'react', groupId, day, entryId: entry.id, value: next })
    if (next !== 0) track('Group Reaction Set', { reaction: next === 1 ? 'like' : 'dislike' })
  }
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
            {entry.kcal} kcal
            <Text variant="caption">
              {'  '}C {Math.round(entry.carbs_g)}g · P {Math.round(entry.protein_g)}g · F{' '}
              {Math.round(entry.fat_g)}g
            </Text>
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
                {t(meal)}
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
        'min-h-[40px] flex-1 flex-row items-center justify-center gap-2 rounded-full border',
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
