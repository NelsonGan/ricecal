import { subDays } from 'date-fns'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import {
  dateKey,
  type Meal,
  useDay,
  useDayLog,
  useLogFood,
  useSelectedDate,
  useTargets,
  useUsualFoods,
} from '@/data'
import { InlineCamera, QuickAction } from '@/features/logging'
import { ItemRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { mealForHour, sumMacros } from '@/lib/nutrition'
import { useThemeColors } from '@/theme/useTheme'
import { Icon, IconButton, SheetSurface, Text } from '@/ui'

/**
 * L2 QUICK SELECTOR, and L3's backdrop.
 *
 * Presented as a transparent modal so Today stays visible behind the scrim,
 * which is what the design shows and what makes the sheet feel attached to the
 * day rather than replacing it.
 *
 * `SheetSurface`, not `Sheet`: the route IS the sheet, so it already has
 * everything `Sheet`'s own native `Modal` would provide. Nesting one inside it
 * meant the route transition had to finish before a second window began
 * presenting, and only then did the panel start its slide — which is why tapping
 * the log button felt slow.
 */
export default function LogSheet() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const params = useLocalSearchParams<{ meal?: Meal }>()
  const logFood = useLogFood()
  const { selectedDate } = useSelectedDate()
  const day = useDayLog(selectedDate)
  const { data: targets } = useTargets()
  const colors = useThemeColors()
  // The viewfinder opens inside this sheet rather than as its own screen, so
  // the day stays visible behind it and nothing has to be dismissed twice.
  const [camera, setCamera] = useState(false)

  // The meal comes from whichever card was tapped, or from the clock when the
  // FAB was used and there is nothing else to go on.
  const meal: Meal = params.meal ?? mealForHour(new Date().getHours())
  const mealName = t(`common:meal.${meal}`)
  const left = (targets?.kcal ?? 0) - sumMacros(day.entries).kcal

  // "What you usually eat at this time", from this user's own history rather
  // than from a column on the shared catalogue.
  const { data: usual = [] } = useUsualFoods(meal)

  // Yesterday is a second day query. Cheap, cached, and the only way to offer
  // "repeat" without keeping every day in memory the way the mock store did.
  const yesterdayKey = dateKey(subDays(new Date(selectedDate), 1))
  const { data: yesterday } = useDay(yesterdayKey)
  const yesterdayEntries = (yesterday?.entries ?? []).filter((entry) => entry.meal === meal)

  const add = (foodId: string, servingId: string) => {
    logFood.mutate({ foodId, servingId, meal, logDate: selectedDate, source: 'quickAdd' })
    goBack()
  }

  const repeatYesterday = () => {
    for (const entry of yesterdayEntries) {
      logFood.mutate({
        foodId: entry.foodId,
        servingId: entry.servingId,
        quantity: entry.quantity,
        meal,
        logDate: selectedDate,
        source: 'quickAdd',
      })
    }
    goBack()
  }

  return (
    <SheetSurface onClose={() => goBack()} scrollable>
      {/* The heading is rendered here rather than through `title` so the
          remaining count can sit on the same line, right aligned, the way the
          design puts it. */}
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="subtitle" className="flex-1" numberOfLines={1}>
          {t('logging:selector.title', { meal: mealName.toLowerCase() })}
        </Text>
        <Text variant="caption">
          {t('logging:selector.remaining', { count: Math.max(0, left) })}
        </Text>
      </View>

      <View className="flex-row gap-2.5">
        <QuickAction
          label={t('logging:selector.snap')}
          icon={{ set: 'system', name: 'camera' }}
          tone="pandan"
          selected={camera}
          onPress={() => setCamera((open) => !open)}
        />
        <QuickAction
          label={t('logging:selector.say')}
          icon={{ set: 'system', name: 'microphone' }}
          tone="hibiscus"
          onPress={() => router.push({ pathname: '/log/voice', params: { meal } })}
        />
        <QuickAction
          label={t('logging:selector.search')}
          icon={{ set: 'ui', name: 'search' }}
          onPress={() => router.push({ pathname: '/log/search', params: { meal } })}
        />
      </View>

      {camera ? <InlineCamera meal={meal} onDone={() => goBack()} /> : null}

      <View className="gap-3 pt-1">
        <Text variant="overline">{t('logging:selector.usual')}</Text>

        {usual.map((food) => (
          <ItemRow
            key={food.id}
            title={food.name}
            icon={food.icon}
            value={food.macros.kcal}
            unit="kcal"
            detail={`${food.servingLabel}, ${t('common:count.times', { count: food.timesLogged ?? 0 })}`}
            trailing={
              <IconButton
                size="sm"
                variant="primary"
                accessibilityLabel={t('common:action.add')}
                onPress={() => add(food.id, food.servings[0]?.id ?? '')}
              >
                {/* Tinted to the role: the plus illustration carries its own
                    gold, which on a pandan button reads as a third colour. */}
                <Icon set="ui" name="plus" size={18} tintColor={colors.onPandan} />
              </IconButton>
            }
          />
        ))}
      </View>

      {yesterdayEntries.length ? (
        <Pressable
          onPress={repeatYesterday}
          className="flex-row items-center justify-center gap-2 rounded-tile border-[3px] border-line border-dashed p-3"
          accessibilityRole="button"
          accessibilityLabel={`${t('logging:selector.repeatYesterday')}, ${
            sumMacros(yesterdayEntries).kcal
          } ${t('common:unit.kcal')}`}
        >
          <Icon set="ui" name="refresh" size={20} />
          <Text variant="label" className="text-muted">
            {t('logging:selector.repeatYesterday')}
          </Text>
        </Pressable>
      ) : (
        <Text variant="meta" className="text-center">
          {t('logging:selector.nothingYesterday')}
        </Text>
      )}
    </SheetSurface>
  )
}
