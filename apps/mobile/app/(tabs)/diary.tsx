import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { MealCard, ScreenTitle } from '@/features/shared'
import {
  dateKey,
  MEALS,
  progressOf,
  sumMacros,
  useAppState,
  useDayBurn,
  useDispatch,
  useSelectedDay,
  useStore,
} from '@/mock'
import { Card, DateStrip, type DateStripDay, ProgressBar, Screen, Text, WaterTracker } from '@/ui'

/** L7 DIARY DAY */
export default function DiaryScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const dispatch = useDispatch()
  const { state } = useStore()
  const day = useSelectedDay()
  const targets = useAppState((app) => app.targets)
  const burn = useDayBurn(state.selectedDate)

  const selected = parseISO(state.selectedDate)
  // The strip always shows the week the selected day belongs to, so paging to
  // Sunday and back does not scroll the row under the user.
  const monday = startOfWeek(selected, { weekStartsOn: 1 })

  const days: DateStripDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index)
    const key = dateKey(date)
    return {
      key,
      initial: format(date, 'EEEEE'),
      day: date.getDate(),
      logged: (state.days[key]?.entries.length ?? 0) > 0,
    }
  })

  const eaten = sumMacros(day.entries)
  // Same credit the ring on Today applies, so the two screens never disagree
  // about how much of the day is left.
  const budget = targets.kcal + burn
  const left = budget - eaten.kcal

  return (
    <Screen>
      <ScreenTitle
        title={t('logging:diary.title')}
        trailing={<Text variant="caption">{format(selected, 'EEE d MMM')}</Text>}
      />

      <DateStrip
        days={days}
        value={state.selectedDate}
        onChange={(date) => dispatch({ type: 'selectDate', date })}
      />

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
            onPressEntry={(entry) =>
              router.push({
                pathname: '/log/food/[id]',
                params: { id: entry.foodId, entryId: entry.id },
              })
            }
          />
        )
      })}

      {day.entries.length === 0 ? (
        <Card>
          <Text variant="meta">{t('logging:diary.emptyDay')}</Text>
        </Card>
      ) : null}

      <Card
        title={t('logging:diary.water', {
          done: day.waterGlasses,
          total: targets.waterGlasses,
        })}
      >
        <WaterTracker
          filled={day.waterGlasses}
          goal={targets.waterGlasses}
          onChange={(glasses) => dispatch({ type: 'setWater', glasses })}
          glassLabel={(ordinal, total) => t('logging:diary.glassOf', { ordinal, total })}
        />
      </Card>
    </Screen>
  )
}
