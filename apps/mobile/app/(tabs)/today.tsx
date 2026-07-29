import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  MEALS,
  useDayBurn,
  useDayLog,
  usePendingSnaps,
  useRemoveEntry,
  useSelectedDate,
  useStreak,
  useTargets,
} from '@/data'
import { MacroBars, MealCard, ScreenTitle } from '@/features/shared'
import { scaleTargets, sumMacros } from '@/lib/nutrition'
import {
  Badge,
  Button,
  CalorieRing,
  Card,
  EmptyState,
  Icon,
  Screen,
  Skeleton,
  Text,
  useToast,
} from '@/ui'

/** How long a just-added row stays highlighted. Matches the undo toast. */
const HIGHLIGHT_MS = 8000

/**
 * L1 TODAY.
 *
 * The screen has three states now that the data is real: no budget yet (a new
 * account whose onboarding never computed one), loading, and a day. The first
 * is not an error — `daily_goals` is deliberately empty until onboarding runs,
 * because a ring drawn against a placeholder is worse than no ring.
 */
export default function TodayScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const toast = useToast()

  const { selectedDate } = useSelectedDate()
  const day = useDayLog(selectedDate)
  const burned = useDayBurn(selectedDate)
  const { data: targets, isPending } = useTargets()
  const streak = useStreak()
  const removeEntry = useRemoveEntry()
  const pending = usePendingSnaps()

  const eaten = sumMacros(day.entries)
  // Exercise is a credit against the day, so the ring measures the budget the
  // user actually has rather than the one they started with.
  const dayTargets = targets ? scaleTargets(targets, targets.kcal + burned) : null
  const budget = dayTargets?.kcal ?? 0
  const left = budget - eaten.kcal
  const over = left < 0

  // The row that was just added, if it landed in the last few seconds. Derived
  // rather than stored: with a server there is no "last added" flag to keep,
  // and the newest entry's timestamp says the same thing.
  const newest = day.entries.filter((entry) => !entry.status).at(-1)
  const justAdded =
    newest && Date.now() - new Date(newest.loggedAt).getTime() < HIGHLIGHT_MS ? newest : undefined

  // Which entry has already been announced. A ref rather than a narrower
  // dependency list: the toast must fire once per entry, and every other value
  // the effect reads — the mutation object, `t` — is a new identity on most
  // renders, so keying on them would replay the confirmation.
  const announced = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!justAdded || announced.current === justAdded.id) return
    announced.current = justAdded.id

    toast.show({
      title: t('logging:added.toast', {
        // Lowercased: the meal name sits mid-sentence here, not as a heading.
        meal: t(`common:meal.${justAdded.meal}`).toLowerCase(),
        kcal: justAdded.macros.kcal.toLocaleString(),
      }),
      tone: 'success',
      icon: { set: 'ui', name: 'check' },
      action: {
        label: t('common:action.undo'),
        onPress: () =>
          removeEntry.mutate({
            id: justAdded.id,
            logDate: justAdded.logDate,
            photoPath: justAdded.photoPath,
          }),
      },
    })
  }, [justAdded, toast, t, removeEntry])

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
            <Text variant="caption" className="text-kaya-ink">
              {t('common:count.dayStreak', { count: streak.current })}
            </Text>
          </Badge>
        }
      />

      <Card>
        {isPending ? (
          <Skeleton className="h-[132px] w-full" />
        ) : dayTargets ? (
          <>
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
          </>
        ) : (
          <EmptyState
            title={t('logging:today.noBudgetTitle')}
            description={t('logging:today.noBudgetBody')}
            icon={{ set: 'body', name: 'target' }}
            action={
              <Button onPress={() => router.push('/settings/goals')}>
                {t('logging:today.noBudgetAction')}
              </Button>
            }
          />
        )}
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
          highlightId={justAdded?.id}
          onAdd={() => router.push({ pathname: '/log', params: { meal } })}
          onPressEntry={(entry) =>
            router.push({
              pathname: '/log/food/[id]',
              params: { id: entry.foodId, entryId: entry.id },
            })
          }
          // A snap that could not be read is dropped as it is handed over:
          // leaving it behind would double the meal once search adds the real
          // dish, and the row has nothing in it worth keeping.
          onFixEntry={(entry) => {
            pending.remove(entry.id)
            router.push({ pathname: '/log/search', params: { meal: entry.meal } })
          }}
        />
      ))}
    </Screen>
  )
}
