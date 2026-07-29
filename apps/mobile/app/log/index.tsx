import { subDays } from 'date-fns'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'
import { QuickAction, useLogFood } from '@/features/logging'
import { ItemRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import {
  dateKey,
  FOODS,
  getFood,
  type Meal,
  mealForHour,
  sumMacros,
  useAppState,
  useDayBurn,
  useSelectedDay,
  useStore,
} from '@/mock'
import { useThemeColors } from '@/theme/useTheme'
import { Icon, IconButton, Sheet, Text } from '@/ui'

/**
 * L2 QUICK SELECTOR, and L3's backdrop.
 *
 * Presented as a transparent modal so Today stays visible behind the scrim,
 * which is what the design shows and what makes the sheet feel attached to the
 * day rather than replacing it.
 */
export default function LogSheet() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const params = useLocalSearchParams<{ meal?: Meal }>()
  const logFood = useLogFood()
  const { state } = useStore()
  const day = useSelectedDay()
  const targets = useAppState((app) => app.targets)
  const burn = useDayBurn(state.selectedDate)
  const colors = useThemeColors()

  // The meal comes from whichever card was tapped, or from the clock when the
  // FAB was used and there is nothing else to go on.
  const meal: Meal = params.meal ?? mealForHour(new Date().getHours())
  const mealName = t(`common:meal.${meal}`)
  const left = targets.kcal + burn - sumMacros(day.entries).kcal

  const usual = FOODS.filter((food) => food.usualMeals?.includes(meal) && food.timesLogged)
    .sort((a, b) => (b.timesLogged ?? 0) - (a.timesLogged ?? 0))
    .slice(0, 3)

  const yesterday = state.days[dateKey(subDays(new Date(), 1))]
  const yesterdayEntries = yesterday?.entries.filter((entry) => entry.meal === meal) ?? []

  const add = (foodId: string) => {
    logFood({ food: getFood(foodId), meal })
    goBack()
  }

  const repeatYesterday = () => {
    for (const entry of yesterdayEntries) {
      logFood({
        food: getFood(entry.foodId),
        meal,
        quantity: entry.quantity,
        servingId: entry.servingId,
      })
    }
    goBack()
  }

  return (
    <Sheet visible onClose={() => goBack()} scrollable>
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
          onPress={() => router.push({ pathname: '/log/camera', params: { meal, mode: 'photo' } })}
        />
        <QuickAction
          label={t('logging:selector.scan')}
          icon={{ set: 'system', name: 'barcode' }}
          tone="kaya"
          onPress={() =>
            router.push({ pathname: '/log/camera', params: { meal, mode: 'barcode' } })
          }
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
                onPress={() => add(food.id)}
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
    </Sheet>
  )
}
