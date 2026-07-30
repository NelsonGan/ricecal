import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  MEALS,
  useDayLog,
  usePendingSnaps,
  useRemoveEntry,
  useSelectedDate,
  useStreak,
  useTargets,
} from '@/data'
import { MacroBars, MealCard, ScreenTitle } from '@/features/shared'
import { sumMacros } from '@/lib/nutrition'
import {
  Badge,
  Button,
  CalorieRing,
  Card,
  EmptyState,
  Icon,
  Screen,
  Skeleton,
  Tappable,
  Text,
  useToast,
} from '@/ui'

/**
 * How recent an entry has to be for the undo toast to be about it.
 *
 * The row itself is no longer marked. It used to say "Just added, tap to edit"
 * for this long, which took the portion off the one row worth reading and put an
 * instruction there that was true of every row on the screen. What survives is
 * the toast, which is where an undo belongs — it is offered once, in passing, and
 * does not change what the diary says.
 */
const ANNOUNCE_MS = 8000

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
  const { data: targets, isPending } = useTargets()
  const streak = useStreak()
  const removeEntry = useRemoveEntry()
  const pending = usePendingSnaps()
  /**
   * Whether the summary is showing the allowance rather than what is left.
   *
   * Not persisted. It is a glance, not a preference — and a setting that survived
   * a relaunch would need somewhere to be changed other than by tapping the thing
   * it changes.
   */
  const [showGoals, setShowGoals] = useState(false)

  const eaten = sumMacros(day.entries)
  const budget = targets?.kcal ?? 0
  const left = budget - eaten.kcal
  const over = left < 0

  // The row that was just added, if it landed in the last few seconds. Derived
  // rather than stored: with a server there is no "last added" flag to keep,
  // and the newest entry's timestamp says the same thing.
  const newest = day.entries.filter((entry) => !entry.status).at(-1)
  const justAdded =
    newest && Date.now() - new Date(newest.loggedAt).getTime() < ANNOUNCE_MS ? newest : undefined

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
          // Badge lays a non-text child out as a row and centres it, so the
          // flame sits against the middle of the label rather than its
          // baseline.
          <Badge tone="kaya">
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
        ) : targets ? (
          <>
            {/* Tapping the summary swaps every number in it from "what is left"
                to "what of the allowance is used". Both readings answer a real
                question and neither fits beside the other at this size, so they
                share the space rather than the card growing a second row. */}
            <Tappable
              className="flex-row items-center gap-4"
              onPress={() => setShowGoals((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={
                showGoals ? t('logging:today.showLeft') : t('logging:today.showGoals')
              }
            >
              <CalorieRing
                value={eaten.kcal}
                goal={budget}
                size={132}
                thickness={16}
                centerLabel={(showGoals ? eaten.kcal : Math.abs(left)).toLocaleString()}
                centerCaption={
                  showGoals
                    ? t('logging:today.kcalOfGoal', { goal: budget.toLocaleString() })
                    : over
                      ? t('logging:today.kcalOver')
                      : t('logging:today.kcalLeft')
                }
              />
              <MacroBars eaten={eaten} targets={targets} showGoal={showGoals} />
            </Tappable>

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
