import { format, parseISO, subDays } from 'date-fns'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  dateKey,
  ENTRY_FOOD_ID,
  useActivityDay,
  useDayLog,
  usePendingSnaps,
  useRemoveEntry,
  useSelectedDate,
  useSettings,
  useStreak,
  useTargets,
} from '@/data'
import {
  DayPlates,
  dayInMonth,
  MonthCalendar,
  monthStart,
  WaterCard,
  WeekPicker,
} from '@/features/logging'
import { useProNudge } from '@/features/paywall'
import { EntryList, MacroBars, ScreenTitle } from '@/features/shared'
import { useTutorialOffer } from '@/features/tutorial'
import { sumMacros } from '@/lib/nutrition'
import { DEFAULT_WATER_ML } from '@/lib/water'
import {
  Badge,
  Button,
  CalorieRing,
  Card,
  EmptyState,
  FloatingAction,
  Icon,
  IconButton,
  Screen,
  Skeleton,
  SkeletonRow,
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

  /**
   * The tour, offered once and never again.
   *
   * It used to be four screens at the end of onboarding. Here it is a toast a
   * beat after the diary appears, so the thing being explained is on screen
   * while the user decides whether they want it explained. See
   * `features/tutorial`.
   */
  useTutorialOffer()

  /**
   * And the standing offer, for a free account, at most once every two days.
   *
   * Here rather than in the tabs layout for the same reason the tour is: it
   * appears over this screen, a beat after it. The two cannot collide in
   * practice — the tour is offered once, on an account whose onboarding paywall
   * has just reset the offer's clock. See `features/paywall/nudge.ts`.
   */
  useProNudge()

  const { selectedDate, setSelectedDate, todayKey } = useSelectedDate()
  const day = useDayLog(selectedDate)
  const { data: targets, isPending: targetsPending, isPaused: targetsPaused } = useTargets()
  const streak = useStreak()
  const removeEntry = useRemoveEntry()
  const pending = usePendingSnaps()
  // The day's movement, if a health store is connected. Null on every account
  // that has not connected one, which is what keeps `burned` at zero below.
  const {
    data: activity,
    isPending: activityPending,
    isPaused: activityPaused,
  } = useActivityDay(selectedDate)
  const { data: settings, isPending: settingsPending, isPaused: settingsPaused } = useSettings()

  /**
   * EVERYTHING UNDER THE STRIP WAITS TOGETHER.
   *
   * Two of these queries are keyed by the selected date, so picking a day puts
   * them both back to "no data" — and every value below reads through a
   * fallback that turns that into a confident statement about the new day. The
   * ring drew the full budget as remaining, the water tank drew itself empty,
   * and the list drew "Nothing logged yet", all for as long as the requests
   * were out. A day someone ate three meals on announced itself as a day they
   * had skipped.
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
  const waiting = day.isPending || targetsPending || activityPending || settingsPending

  /**
   * And a wait that cannot end is not a wait.
   *
   * A query with nothing cached is PAUSED rather than sent, so
   * every flag above stays true for as long as the phone is offline and the
   * placeholders above would sit there until it is not. Which is the right
   * answer for a day already on this phone — a persisted day is not pending at
   * all, and the screen draws it without asking anybody — and no answer for one
   * that never made it here.
   *
   * Said once, over the whole region, for the same reason the wait is: these
   * queries are one sentence about one day, and "we could not read your
   * movement" over a fully drawn ring is the same disagreement the gate exists
   * to prevent. The strip stays above it, so the way out is to pick a day the
   * phone already has.
   *
   * The two flags are paired PER QUERY rather than or-ed across the four, and
   * that is not tidiness. `isPaused` is about a request, `isPending` about
   * data, and they come apart in the ordinary case: a query that has its answer
   * from disk and cannot refetch is paused and NOT pending. Compared loosely,
   * one such query plus one genuinely in flight reads as stalled, and the
   * screen would say the day is not on this phone over a day that was seconds
   * from arriving. `blocked` is the whole condition: nothing to draw, and
   * nothing on its way.
   */
  const blocked = (isPending: boolean, isPaused: boolean) => isPending && isPaused
  const stalled =
    blocked(day.isPending, day.isPaused) ||
    blocked(targetsPending, targetsPaused) ||
    blocked(activityPending, activityPaused) ||
    blocked(settingsPending, settingsPaused)
  const loading = waiting && !stalled
  /**
   * Whether the summary is showing the allowance rather than what is left.
   *
   * Not persisted. It is a glance, not a preference — and a setting that survived
   * a relaunch would need somewhere to be changed other than by tapping the thing
   * it changes.
   */
  const [showGoals, setShowGoals] = useState(false)

  /**
   * WHICH OF THE TWO WAYS OF READING THE DIARY IS ON SCREEN.
   *
   * The day, or the month. They answer different questions — "what did I eat"
   * and "what have I been eating" — and the month can only answer its one by
   * being mostly pictures, which leaves no room for the ring, the water and the
   * list. So it REPLACES them rather than sitting above them.
   *
   * Not persisted, for the reason `showGoals` is not: the diary is the screen
   * this app opens on, and a launch that landed on a month grid because of a
   * tap three days ago would be the app having changed its mind about what it
   * is. The toggle is one tap away from either.
   */
  const [calendar, setCalendar] = useState(false)
  /**
   * The month the grid is showing, which is NOT the selected day's month for
   * long: paging changes this and moves the selection with it, so the card
   * under the grid never describes a day that is not on screen. Seeded from
   * whatever day the strip had picked, and re-seeded each time the calendar is
   * opened — coming back to it a week later on last month's grid would be the
   * screen remembering something the user had not asked it to.
   */
  const [month, setMonth] = useState(() => monthStart(selectedDate))

  /**
   * A row is parked open with its Delete showing. See the `floating` slot.
   *
   * Declared beside the view mode rather than beside the list, because the two
   * are one piece of state about what is on screen: see `showCalendar` below.
   */
  const [swipeOpen, setSwipeOpen] = useState(false)

  /**
   * Switching views takes the swipe state with it.
   *
   * `swipeOpen` is reported by `EntryList` when a row opens or closes, and the
   * calendar UNMOUNTS that list — so a row left open when the toggle is pressed
   * leaves the flag true with nothing able to clear it, and `floating` renders
   * nothing. The log button simply disappears, and coming back to the day view
   * does not bring it back either, since the list remounts with no row open and
   * has nothing to report. Cleared here because this is the one place that knows
   * the list is going away.
   */
  const showCalendar = (on: boolean) => {
    setSwipeOpen(false)
    if (on) setMonth(monthStart(selectedDate))
    setCalendar(on)
  }

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
   * Two litres until told otherwise.
   *
   * Unlike the calorie budget this does not wait for onboarding: it is the same
   * figure for every body, `daily_goals` defaults the column to it, and the tank
   * is useful on an account that has never described itself. A ring drawn against
   * a placeholder would be a lie; two litres is not a guess about this user.
   */
  const waterGoal = targets?.waterMl ?? DEFAULT_WATER_ML

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
            source: justAdded.source,
          }),
      },
    })
  }, [justAdded, toast, t, removeEntry])

  /**
   * A day this phone has never seen, with no way to ask for it.
   *
   * The strip comes too, so the answer to it is on screen: the days already
   * saved here are one tap away. No retry and no spinner — react-query resumes
   * a paused query by itself, and this screen redraws when it lands.
   *
   * No streak badge either. `logging_streak()` is a request like any other, and
   * a confident "0 day streak" is the wrong sentence about somebody who is
   * merely out of signal.
   */
  if (stalled) {
    return (
      // Plain `Screen`: nothing here swipes, so this one does not need
      // gesture-handler's scroll view the way the day below does.
      <Screen>
        <ScreenTitle title={title} />
        <WeekPicker />
        <Card>
          <EmptyState
            title={t('common:offline.dayTitle')}
            description={t('common:offline.dayBody')}
            icon={{ set: 'ui', name: 'offline' }}
          />
        </Card>
      </Screen>
    )
  }

  return (
    // The one screen with swipeable rows on it, and the one that needs
    // gesture-handler's scroll view for them to work. Nothing here takes
    // typing, which is what makes that trade free — see `gestureScroll`.
    <Screen
      gestureScroll
      /**
       * OUT OF THE WAY WHILE A ROW IS OPEN FOR DELETE.
       *
       * `floating` overlaps the scroll content by design, and this button's
       * corner is exactly where a swiped row's Delete comes to rest for
       * whichever entry happens to be at that height. Drawn above the list, it
       * took the tap: swipe the row, aim at the bin, and the log sheet opened
       * instead — a confirmation-free destructive action replaced by the wrong
       * screen, which is at least the safe direction to fail in.
       *
       * Hidden rather than moved. There is nowhere to move it to that is not
       * over some other row, and a control that jumps aside when you swipe is
       * a second thing happening.
       */
      floating={
        swipeOpen ? null : (
          <FloatingAction onPress={() => router.push('/log')} label={t('common:nav.log')} />
        )
      }
    >
      <ScreenTitle
        title={title}
        leading={
          /* The view toggle goes BEFORE the date, because it is a control about
             what the date is showing rather than a report on it: the whole
             screen under the heading changes when it is pressed. The streak, on
             the other side, only ever reports. */
          <IconButton
            /* Smaller than the 44pt floor so it stands the same height as the
               streak badge opposite it: a 44pt square beside a 38pt pill reads
               as two controls that were placed separately. The touch target is
               taken back to 44 with `hitSlop`, so the floor is moved rather than
               waived. */
            size="xs"
            hitSlop={3}
            onPress={() => showCalendar(!calendar)}
            accessibilityLabel={t(
              calendar ? 'logging:calendar.showDay' : 'logging:calendar.showMonth',
            )}
          >
            {/* The icon is the view being OFFERED, not the one on screen. A
                toggle that shows its own state has to be read twice. */}
            <Icon set="ui" name={calendar ? 'list-view' : 'calendar-view'} size={19} />
          </IconButton>
        }
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

      {calendar ? (
        <>
          <MonthCalendar
            month={month}
            onMonthChange={(start) => {
              setMonth(start)
              // The selection follows the grid. Left where it was, the card
              // under a July calendar would go on describing a day in August,
              // and tapping a July day would be the only way to notice.
              setSelectedDate(dayInMonth(start, selectedDate, todayKey))
            }}
            selected={selectedDate}
            onSelect={setSelectedDate}
            today={todayKey}
          />

          <DayPlates
            /* Clear of the floating action, which overlaps the scroll content
               by design. The list view owes its own last row the same thing;
               here there is exactly one card, so the padding is on it. */
            className="mb-[76px]"
            date={selectedDate}
            entries={day.entries}
            loading={loading}
            onPressEntry={(entry) =>
              router.push({
                pathname: '/log/food/[id]',
                params: { id: entry.foodId ?? ENTRY_FOOD_ID, entryId: entry.id },
              })
            }
          />
        </>
      ) : (
        <>
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
                {/* Tapping the summary swaps every number in it from "what is
                left" to "what of the allowance is used". Both readings answer a
                real question and neither fits beside the other at this size, so
                they share the space rather than the card growing a second row. */}
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
                  <MacroBars
                    className="flex-1"
                    eaten={eaten}
                    targets={targets}
                    showGoal={showGoals}
                  />
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
          logged all day, a drink at a time, and it is the one thing here that a
          user reaches for without having eaten anything. Below the entry list it
          would be under however many rows the day has grown.

          The GOAL is known before the day is — it falls back to two litres,
          which is not a guess about this user — so the tank keeps its size
          throughout and only the level waits. That is why the placeholder is
          inside the card: nothing changes height, and the figure beside the
          heading is simply absent until there is one. */}
          <WaterCard date={selectedDate} ml={day.waterMl} goalMl={waterGoal} loading={loading} />

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
                  // A `[id]` segment cannot be filled with `undefined`, and an
                  // entry's `food_id` is null whenever the scan did not land on a
                  // catalogue row — an estimate, an archetype, a rebuilt plate, a
                  // typed meal, a recipe. Every one of those went to `+not-found`
                  // rather than opening. The placeholder says "read it off the
                  // entry", which the entry can answer.
                  params: { id: entry.foodId ?? ENTRY_FOOD_ID, entryId: entry.id },
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
                  source: entry.source,
                })
                toast.show({ title: t('logging:added.removedToast') })
              }}
              onSwipeOpenChange={setSwipeOpen}
            />
          )}
        </>
      )}
    </Screen>
  )
}
