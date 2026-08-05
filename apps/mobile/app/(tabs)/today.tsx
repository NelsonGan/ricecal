import { format, parseISO, subDays } from 'date-fns'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  dateKey,
  useActivityDay,
  useDayLog,
  usePendingSnaps,
  useRemoveEntry,
  useSelectedDate,
  useSettings,
  useSetWater,
  useStreak,
  useTargets,
} from '@/data'
import { WeekPicker } from '@/features/logging'
import { EntryList, MacroBars, ScreenTitle } from '@/features/shared'
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
  SkeletonRow,
  Tappable,
  Text,
  useToast,
  WaterTracker,
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
 * The day before a given one, as `yyyy-MM-dd`.
 *
 * Off `todayKey` rather than off the clock: that key is fixed at mount so a
 * session that crosses midnight keeps its footing, and `isYesterday()` would
 * quietly disagree with it at 00:00.
 */
const yesterday = (key: string) => dateKey(subDays(parseISO(key), 1))

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

  const { selectedDate, todayKey } = useSelectedDate()
  const day = useDayLog(selectedDate)
  const { data: targets, isPending: targetsPending } = useTargets()
  const streak = useStreak()
  const removeEntry = useRemoveEntry()
  const pending = usePendingSnaps()
  const setWater = useSetWater(selectedDate)
  // The day's movement, if a health store is connected. Null on every account
  // that has not connected one, which is what keeps `burned` at zero below.
  const { data: activity, isPending: activityPending } = useActivityDay(selectedDate)
  const { data: settings, isPending: settingsPending } = useSettings()

  /**
   * EVERYTHING UNDER THE STRIP WAITS TOGETHER.
   *
   * Two of these queries are keyed by the selected date, so picking a day puts
   * them both back to "no data" — and every value below reads through a
   * fallback that turns that into a confident statement about the new day. The
   * ring drew the full budget as remaining, the tracker drew eight empty
   * glasses, and the list drew "Nothing logged yet", all for as long as the
   * requests were out. A day someone ate three meals on announced itself as a
   * day they had skipped.
   *
   * The gate is the whole region rather than a flag per card, because these are
   * one sentence about one day: staggering them would reveal the ring's answer
   * over an empty list, which is the same disagreement in slow motion. Days
   * already in the cache — the persisted ones, and any week the user is paging
   * back and forth over — are never pending, so this costs a placeholder only
   * on a day genuinely being fetched for the first time.
   *
   * `settings` is in here for a narrower reason: it holds
   * `activity_extends_budget`, which decides whether the day's movement counts
   * toward the ring at all. Missing, it defaults to counting — so an account
   * that turned it off saw the larger budget first and watched the ring
   * tighten. The strip's dots are drawn against that same sum and gate on the
   * same query, because the ring and the dot under it describe one day and must
   * not disagree about it.
   */
  const loading = day.isPending || targetsPending || activityPending || settingsPending
  /**
   * Whether the summary is showing the allowance rather than what is left.
   *
   * Not persisted. It is a glance, not a preference — and a setting that survived
   * a relaunch would need somewhere to be changed other than by tapping the thing
   * it changes.
   */
  const [showGoals, setShowGoals] = useState(false)

  const eaten = sumMacros(day.entries)

  /**
   * Whether the screen is showing the day it is named after.
   *
   * The strip can put any earlier day on this screen, and three pieces of copy
   * here are written in the present tense. A heading that still says "Today"
   * over last Tuesday's meals is the one way this feature can actively mislead
   * — the rest is a matter of tense.
   */
  const isToday = selectedDate === todayKey
  const title = isToday
    ? t('logging:today.title')
    : selectedDate === yesterday(todayKey)
      ? t('common:date.yesterday')
      : format(parseISO(selectedDate), 'EEE d MMM')

  /**
   * Movement extends the budget; it never shrinks what was eaten.
   *
   * `activeKcal` and not the day's total burn — the goal is already a
   * Mifflin-St Jeor figure containing basal metabolism, so adding resting
   * energy would credit a user for being alive twice. The same rule, and the
   * same reasoning, as `BudgetStrip` on the Activity tab; that screen shows the
   * arithmetic and this one shows its result.
   *
   * Zero on an account with no health connection, so the ring is exactly what
   * it was before any of this existed.
   */
  const burned = settings?.activity_extends_budget === false ? 0 : (activity?.activeKcal ?? 0)
  const budget = (targets?.kcal ?? 0) + burned
  const left = budget - eaten.kcal
  const over = left < 0

  /**
   * Eight glasses until told otherwise.
   *
   * Unlike the calorie budget this does not wait for onboarding: it is the same
   * number for every body, `daily_goals` defaults the column to it, and the tracker
   * is useful on an account that has never described itself. A ring drawn against a
   * placeholder would be a lie; eight glasses is not a guess about this user.
   */
  const waterGoal = targets?.waterGlasses ?? 8

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
      title: t('logging:added.toast', { kcal: justAdded.macros.kcal.toLocaleString() }),
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

  return (
    // The one screen with swipeable rows on it, and the one that needs
    // gesture-handler's scroll view for them to work. Nothing here takes
    // typing, which is what makes that trade free — see `gestureScroll`.
    <Screen gestureScroll>
      <ScreenTitle
        title={title}
        trailing={
          // Nothing at all until the count is known: "0 day streak" is a
          // sentence about the user, and it is the wrong one on every account
          // that has a streak.
          streak.isPending ? undefined : (
            // Badge lays a non-text child out as a row and centres it, so the
            // flame sits against the middle of the label rather than its
            // baseline.
            <Badge tone="kaya">
              <Icon set="body" name="flame-burn" size={18} />
              <Text variant="caption" className="text-kaya-ink">
                {t('common:count.dayStreak', { count: streak.current })}
              </Text>
            </Badge>
          )
        }
      />

      {/* The week, above everything it explains. A day is picked here and the
          whole screen below follows it — the ring, the water, the entries and
          anything logged while it is selected. */}
      <WeekPicker />

      <Card>
        {loading ? (
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
              {/* Sharing the row with the ring, so it asks for the space the
                  ring leaves. Stacked callers do not. */}
              <MacroBars className="flex-1" eaten={eaten} targets={targets} showGoal={showGoals} />
            </Tappable>

            {/* Where the extra came from.
                Without this line the goal simply reads higher than the one set
                in Settings, and the first thought is that the app has changed
                it. Only shown when there IS movement credited, so an account
                with no health store sees the screen it always saw. */}
            {burned > 0 ? (
              <Text variant="meta" className="pt-1 text-pandan-ink">
                {t(isToday ? 'logging:today.burnedNote' : 'logging:today.burnedNoteOn', {
                  kcal: burned.toLocaleString(),
                })}
              </Text>
            ) : null}

            {over ? (
              <Text variant="meta" className="pt-1">
                {t(isToday ? 'logging:today.overNote' : 'logging:today.overNoteOn')}
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

      {/* Water sits under the ring rather than at the foot of the screen: it is
          logged all day, a tap at a time, and it is the one thing here that a user
          reaches for without having eaten anything. Below the entry list it would
          be under however many rows the day has grown.

          The GOAL is known before the day is — it falls back to eight, which is
          not a guess about this user — so the grid keeps its size throughout and
          only the fill waits. That is why the placeholder is inside the tracker
          rather than a block over the card: the row never changes height, and
          the count beside the heading is simply absent until there is one. */}
      <Card
        tone="water"
        title={t('logging:water.title')}
        action={
          loading ? undefined : (
            <Text variant="label" className="text-water-ink">
              {t('logging:water.count', { filled: day.waterGlasses, goal: waterGoal })}
            </Text>
          )
        }
      >
        <WaterTracker
          filled={day.waterGlasses}
          goal={waterGoal}
          loading={loading}
          // `mutate`, not `mutateAsync`: the optimistic update in `useSetWater` is
          // what fills the glass, and nothing here waits for the row to be written.
          onChange={(glasses) => setWater.mutate(glasses)}
          glassLabel={(ordinal, total) => t('logging:water.glass', { ordinal, total })}
        />
      </Card>

      {/* Two rows of placeholder rather than one, because one reads as a card
          with a single meal in it and the point of the block is that nobody yet
          knows how many there are. */}
      {loading ? (
        <Card>
          <SkeletonRow />
          <SkeletonRow />
        </Card>
      ) : day.entries.length === 0 ? /* No "Nothing logged yet" block. A day
          before its first meal is the state this screen is in every morning,
          and a card announcing it pushed the water tracker and the ring apart
          to say something the empty list already said. The FAB is the answer to
          "what now", and it is on screen either way. */
      null : (
        /* One list, in the order the day happened. It was a card per meal, and
           three of the four were usually empty — each still taking a heading and
           an add button, so two entries filled a screen with furniture. */
        <EntryList
          day={day}
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
            router.push({ pathname: '/log/search' })
          }}
          // Nothing was logged for a photo with no food in it, so there is no
          // entry to delete — dismissing drops the row the shutter put there.
          onDismissEntry={(entry) => pending.remove(entry.id)}
          // Swipe left, tap the bin. A wrong scan is the common case and it took
          // two screens to undo; this is the shortcut, and the detail screen's
          // delete is still there for anyone who wants to look first.
          onDeleteEntry={(entry) => {
            removeEntry.mutate({
              id: entry.id,
              logDate: entry.logDate,
              photoPath: entry.photoPath,
            })
            toast.show({ title: t('logging:added.removedToast') })
          }}
        />
      )}
    </Screen>
  )
}
