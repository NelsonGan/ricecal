import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'

import { useSettings } from '@/data'
import { ExerciseArt, LiveHeart, useExerciseLibrary } from '@/features/workouts'
import { UNIT_KEY, unitFor } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import { cn, Icon, Text } from '@/ui'

const EXERCISE = 'barbell-squat'

/** Two sets done and one to go, in round numbers in either unit. */
const SETS = [
  { kg: 80, lb: 175, reps: 5, done: true },
  { kg: 80, lb: 175, reps: 5, done: true },
  { kg: 80, lb: 175, reps: 5, done: false },
] as const

/**
 * The logger in miniature: one exercise with its sets ticking off, drawn with
 * the logger's own art and checkboxes. On iOS a beating heart under it, since
 * that is what the Apple Watch adds and the page says so; Android has no watch
 * app and its page does not mention one.
 */
export function WorkoutsPreview() {
  const { t } = useTranslation(['news', 'common', 'activity'])
  const colors = useThemeColors()
  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)
  // The catalogue's own name, which the logger shows in every language.
  const name = useExerciseLibrary().byId(EXERCISE)?.name ?? ''

  return (
    <View
      className="items-center"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('news:workouts.previewLabel')}
    >
      <View className="w-[208px] gap-2 overflow-hidden rounded-[22px] bg-surface p-3">
        <View className="flex-row items-center gap-2.5">
          <ExerciseArt exerciseId={EXERCISE} category="legs" size={40} />
          <Text variant="label" numberOfLines={1} className="shrink">
            {name}
          </Text>
        </View>
        {SETS.map((set, index) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed picture
            key={index}
            className={cn(
              'flex-row items-center gap-2 rounded-[10px] px-2 py-1',
              set.done && 'bg-pandan-soft',
            )}
          >
            <Text variant="label" className="w-4">
              {index + 1}
            </Text>
            <Text variant="body" className="flex-1">
              {`${unit === 'lb' ? set.lb : set.kg} ${t(UNIT_KEY[unit])} × ${set.reps}`}
            </Text>
            {set.done ? (
              <View className="h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-pandan">
                <Icon set="ui" name="check" size={15} tintColor={colors.onPandan} />
              </View>
            ) : (
              <View className="h-[22px] w-[22px] rounded-[7px] border-2 border-line-strong bg-surface" />
            )}
          </View>
        ))}
        {Platform.OS === 'ios' ? (
          <View className="flex-row items-center gap-1.5 self-start rounded-full bg-hibiscus-soft px-2.5 py-1">
            <LiveHeart bpm={128} />
            <Text variant="label">{`128 ${t('activity:workout.bpmUnit')}`}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
