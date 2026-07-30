import { useTranslation } from 'react-i18next'
import { ScrollView, View } from 'react-native'

import { type Entry, MEALS, useDayLog, useSetWater, useTargets } from '@/data'
import { progressOf, sumMacros } from '@/lib/nutrition'
import { spacing } from '@/theme/tokens'
import { Card, ProgressBar, Text, WaterTracker } from '@/ui'
import { MealCard } from '../shared'

export type DayPanelProps = {
  /** ISO date key. */
  date: string
  onPressEntry: (entry: Entry) => void
  onFixEntry: (entry: Entry) => void
  /** Room at the bottom for the tab bar, which this scroll view sits under. */
  bottomInset: number
}

/**
 * One day of the diary, scrollable on its own.
 *
 * A component rather than the body of the screen because three of these are
 * mounted at once — the day either side of the one on screen, so a swipe has
 * somewhere to go and its data is already there. Each one owns its queries for the
 * same reason: `useDayLog` is keyed by date, so the neighbours are fetched and
 * cached by being rendered, and arriving on one is instant.
 */
export function DayPanel({ date, onPressEntry, onFixEntry, bottomInset }: DayPanelProps) {
  const { t } = useTranslation(['logging', 'common'])
  const day = useDayLog(date)
  const { data: targets } = useTargets()
  const setWater = useSetWater(date)

  const eaten = sumMacros(day.entries)
  // Same credit the ring on Today applies, so the two screens never disagree
  // about how much of the day is left.
  const budget = targets?.kcal ?? 0
  const left = budget - eaten.kcal
  const waterGoal = targets?.waterGlasses ?? 8

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: spacing.gutter,
        paddingBottom: spacing.gutter + bottomInset,
        gap: spacing.stack,
      }}
    >
      <Card>
        <View className="flex-row items-end justify-between">
          <View>
            <Text variant="overline">{t('logging:diary.eaten')}</Text>
            <Text className="font-display text-[28px] leading-[34px] text-heading">
              {eaten.kcal.toLocaleString()}
            </Text>
          </View>
          <View className="items-end">
            <Text variant="overline">
              {left < 0 ? t('logging:diary.over') : t('logging:diary.left')}
            </Text>
            <View className="flex-row items-baseline gap-1">
              <Text className="font-display text-[28px] leading-[34px] text-pandan-ink">
                {Math.abs(left).toLocaleString()}
              </Text>
              <Text variant="caption">{t('common:unit.kcal')}</Text>
            </View>
          </View>
        </View>

        <ProgressBar
          value={progressOf(eaten.kcal, budget)}
          height={16}
          tone={left < 0 ? 'kaya' : 'pandan'}
          accessibilityLabel={t('logging:diary.eaten')}
        />
      </Card>

      {MEALS.map((meal) => {
        const hasEntries = day.entries.some((entry) => entry.meal === meal)
        if (!hasEntries) return null
        return (
          <MealCard
            key={meal}
            meal={meal}
            day={day}
            detail="time"
            onPressEntry={onPressEntry}
            onFixEntry={onFixEntry}
          />
        )
      })}

      {day.entries.length === 0 ? (
        <Card>
          <Text variant="meta">{t('logging:diary.emptyDay')}</Text>
        </Card>
      ) : null}

      <Card title={t('logging:diary.water', { done: day.waterGlasses, total: waterGoal })}>
        <WaterTracker
          filled={day.waterGlasses}
          goal={waterGoal}
          onChange={(glasses) => setWater.mutate(glasses)}
          glassLabel={(ordinal, total) => t('logging:diary.glassOf', { ordinal, total })}
        />
      </Card>
    </ScrollView>
  )
}
