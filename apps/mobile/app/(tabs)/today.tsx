import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { MacroBars, MealCard, ScreenTitle } from '@/features/shared'
import {
  MEALS,
  scaleTargets,
  sumMacros,
  useAppState,
  useDayBurn,
  useDispatch,
  useSelectedDay,
  useStore,
} from '@/mock'
import { Badge, CalorieRing, Card, EmptyState, Icon, Screen, Text, useToast } from '@/ui'

/** How long a just-added row stays highlighted. Matches the undo toast. */
const HIGHLIGHT_MS = 8000

/**
 * L1 TODAY, and L4 once something has just been added.
 *
 * L4 is not a separate screen: it is this one with `lastAdded` set, which
 * highlights the new row and raises the undo toast. Modelling it as state
 * rather than a route is what lets the modal that logged the food simply
 * dismiss back to here.
 */
export default function TodayScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const dispatch = useDispatch()
  const toast = useToast()

  const day = useSelectedDay()
  const { state } = useStore()
  const burned = useDayBurn(state.selectedDate)
  const { targets, streak, lastAdded } = useAppState((app) => ({
    targets: app.targets,
    streak: app.streak,
    lastAdded: app.lastAdded,
  }))

  const eaten = sumMacros(day.entries)
  // Exercise is a credit against the day, so the ring measures the budget the
  // user actually has rather than the one they started with.
  const dayTargets = scaleTargets(targets, targets.kcal + burned)
  const budget = dayTargets.kcal
  const left = budget - eaten.kcal
  const over = left < 0

  useEffect(() => {
    if (!lastAdded) return
    toast.show({
      title: t('logging:added.toast', {
        // Lowercased: the meal name sits mid-sentence here, not as a heading.
        meal: t(`common:meal.${lastAdded.meal}`).toLowerCase(),
        kcal: lastAdded.kcal.toLocaleString(),
      }),
      tone: 'success',
      icon: { set: 'ui', name: 'check' },
      action: {
        label: t('common:action.undo'),
        onPress: () => dispatch({ type: 'removeEntry', id: lastAdded.entryId }),
      },
    })
    // The flag is consumed, not left set: coming back to this tab later should
    // not replay a confirmation for something logged an hour ago. Held for as
    // long as the toast, so the highlight and the undo offer end together.
    const timer = setTimeout(() => dispatch({ type: 'clearLastAdded' }), HIGHLIGHT_MS)
    return () => clearTimeout(timer)
  }, [lastAdded, dispatch, t, toast])

  // Snack only earns a card once there is something in it. Four empty cards on
  // a fresh day is a chore list, not a summary.
  const meals = MEALS.filter(
    (meal) => meal !== 'snack' || day.entries.some((entry) => entry.meal === 'snack'),
  )

  return (
    <Screen>
      <ScreenTitle
        title={t('logging:today.title')}
        trailing={
          <Badge tone="kaya" className="flex-row items-center gap-1.5">
            <Icon set="body" name="flame-burn" size={18} />
            <Text className="font-body-black text-[12px] leading-[15px] text-kaya-ink">
              {t('common:count.dayStreak', { count: streak.current })}
            </Text>
          </Badge>
        }
      />

      <Card>
        <View className="flex-row items-center gap-4">
          <CalorieRing
            value={eaten.kcal}
            goal={budget}
            size={132}
            thickness={16}
            centerLabel={Math.abs(left).toLocaleString()}
            centerCaption={over ? t('logging:today.kcalOver') : t('logging:today.kcalLeft')}
          />
          <MacroBars eaten={eaten} targets={dayTargets} />
        </View>

        {over ? (
          <Text variant="meta" className="pt-1">
            {t('logging:today.overNote')}
          </Text>
        ) : null}
      </Card>

      {day.entries.length === 0 ? (
        <EmptyState
          title={t('logging:today.emptyTitle')}
          description={t('logging:today.emptyBody')}
          icon={{ set: 'food', name: 'empty-plate' }}
        />
      ) : null}

      {meals.map((meal) => (
        <MealCard
          key={meal}
          meal={meal}
          day={day}
          highlightId={lastAdded?.entryId}
          onAdd={() => router.push({ pathname: '/log', params: { meal } })}
          onPressEntry={(entry) =>
            router.push({
              pathname: '/log/food/[id]',
              params: { id: entry.foodId, entryId: entry.id },
            })
          }
        />
      ))}
    </Screen>
  )
}
