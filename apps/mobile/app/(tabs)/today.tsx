import { onlineManager } from '@tanstack/react-query'
import { format, parseISO, subDays } from 'date-fns'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWindowDimensions, View } from 'react-native'
import {
  dateKey,
  ENTRY_FOOD_ID,
  type Entry,
  useActivityDay,
  useActivitySessions,
  useDayLog,
  usePendingSnaps,
  useRemoveEntry,
  useSelectedDate,
  useSettings,
  useStreak,
  useTargets,
} from '@/data'
import { socialEntryPost } from '@/data/social'
import { count, SessionItem } from '@/features/activity'
import {
  createDeleteGate,
  MonthCalendar,
  monthStart,
  WaterCard,
  WeekPicker,
} from '@/features/logging'
import { useProNudge } from '@/features/paywall'
import { EntryList, MacroBars, ScreenTitle } from '@/features/shared'
import { useTutorialOffer } from '@/features/tutorial'
import { datePattern } from '@/lib/dates'
import { sumMacros } from '@/lib/nutrition'
import { DEFAULT_WATER_ML } from '@/lib/water'
import {
  Badge,
  Button,
  CalorieRing,
  Card,
  ConfirmSheet,
  EmptyState,
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
 * How recent an entry has to be for the undo toast to be about it. The row
 * itself is no longer marked: "Just added, tap to edit" took the portion off the
 * one row worth reading, to say something true of every row on the screen.
 */
const ANNOUNCE_MS = 8000

/**
 * The day before a given one, as `yyyy-MM-dd`. Off `todayKey` rather than the
 * clock: that key is fixed at mount so a session crossing midnight keeps its
 * footing, where `isYesterday()` would disagree with it at 00:00.
 */
const yesterday = (key: string) => dateKey(subDays(parseISO(key), 1))

/**
 * Today.
 *
 * Three states: no budget yet, loading, and a day. The first is not an error;
 * `daily_goals` is empty until onboarding runs, because a ring drawn against a
 * placeholder is worse than no ring.
 */
export default function TodayScreen() {
  const { t } = useTranslation(['logging', 'common', 'social'])
  const router = useRouter()
  const toast = useToast()
  const { width, fontScale } = useWindowDimensions()
  const stackedSummary = width < 380 || fontScale > 1.3

  /**
   * The tour, offered once and never again.
   */
  useTutorialOffer()

  /**
   * The standing offer, for a free account, at most once every two days. Here
   * rather than in the tabs layout for the reason the tour is: it appears over
   * this screen, a beat after it. See `features/paywall/nudge.ts`.
   */
  useProNudge()

  const { selectedDate, setSelectedDate, todayKey } = useSelectedDate()
  const day = useDayLog(selectedDate)
  const { data: targets, isPending: targetsPending, isPaused: targetsPaused } = useTargets()
  const streak = useStreak()
  const removeEntry = useRemoveEntry()
  const [sharedDelete, setSharedDelete] = useState<Entry | null>(null)
  const queueRemove = removeEntry.mutate
  const removeAsync = removeEntry.mutateAsync
  const deleteEntry = useCallback(
    async (entry: Entry) => {
      const variables = {
        id: entry.id,
        logDate: entry.logDate,
        photoPath: entry.photoPath,
        source: entry.source,
      }
      // Diary deletes have always queued offline. A social warning must not
      // turn that private diary action into an online-only operation.
      if (onlineManager.isOnline()) await removeAsync(variables)
      else queueRemove(variables)
      toast.show({ title: t('logging:added.removedToast') })
    },
    [queueRemove, removeAsync, t, toast],
  )
  // Asked when the meal is deleted, since a post can be made or removed on
  // another device. A meal with no post goes at once, as a swipe always did.
  // One with a post, or one that cannot be checked, asks first, because its
  // comments are other people's words. Resolves with whether the meal went, so
  // a swiped row the user keeps slides back.
  const deleteGate = useRef(createDeleteGate()).current
  const decided = useRef<((deleted: boolean) => void) | undefined>(undefined)
  const settleDelete = (deleted: boolean) => {
    decided.current?.(deleted)
    decided.current = undefined
  }
  const requestDelete = useCallback(
    async (entry: Entry): Promise<boolean> =>
      await deleteGate(async () => {
        if ((await socialEntryPost(entry.id)) !== null) {
          return await new Promise<boolean>((resolve) => {
            decided.current = resolve
            setSharedDelete(entry)
          })
        }
        queueRemove({
          id: entry.id,
          logDate: entry.logDate,
          photoPath: entry.photoPath,
          source: entry.source,
          shared: false,
        })
        toast.show({ title: t('logging:added.removedToast') })
        return true
      }),
    [deleteGate, queueRemove, t, toast],
  )
  const pending = usePendingSnaps()
  // The day's movement, if a health store is connected. Null on every account
  // that has not connected one, which is what keeps `burned` at zero below.
  const {
    data: activity,
    isPending: activityPending,
    isPaused: activityPaused,
  } = useActivityDay(selectedDate)
  const { data: settings, isPending: settingsPending, isPaused: settingsPaused } = useSettings()
  // The day's workouts, drawn among its meals. Not part of the wait below: a day
  // whose meals are ready should not hold for the list of sessions, which on
  // most accounts is empty.
  const sessions = useActivitySessions(selectedDate).data ?? []

  /**
   * Everything under the strip waits together.
   *
   * Two of these queries are keyed by the selected date, so picking a day puts
   * them back to "no data" and every value below falls back to a confident
   * statement about it: the ring drew the full budget as remaining and the list
   * drew "Nothing logged yet", so a day somebody ate three meals on announced
   * itself as a day they had skipped.
   *
   * The gate covers the whole region rather than a flag per card, because these
   * are one sentence about one day. Cached days are never pending, so this costs
   * a placeholder only on a first fetch.
   *
   * `settings` is here because it holds `activity_extends_budget`: missing, it
   * defaults to counting, so an account that turned it off saw the larger budget
   * first and watched the ring tighten.
   */
  const waiting = day.isPending || targetsPending || activityPending || settingsPending

  /**
   * A wait that cannot end is not a wait.
   *
   * A query with nothing cached is paused rather than sent, so every flag above
   * stays true for as long as the phone is offline. The strip stays above this,
   * so the way out is to pick a day the phone already has.
   *
   * The two flags are paired per query rather than or-ed across the four:
   * `isPaused` is about a request and `isPending` about data, and they come apart
   * for a query answered from disk that cannot refetch. Compared loosely, one of
   * those plus one genuinely in flight reads as stalled.
   */
  const blocked = (isPending: boolean, isPaused: boolean) => isPending && isPaused
  const stalled =
    blocked(day.isPending, day.isPaused) ||
    blocked(targetsPending, targetsPaused) ||
    blocked(activityPending, activityPaused) ||
    blocked(settingsPending, settingsPaused)
  const loading = waiting && !stalled
  /**
   * Whether the summary is showing the allowance rather than what is left. Not
   * persisted: it is a glance rather than a preference, and one that survived a
   * relaunch would need somewhere to be changed other than the thing it changes.
   */
  const [showGoals, setShowGoals] = useState(false)

  /**
   * Which of the two ways of reading the diary is on screen: the day, or the
   * month. They answer "what did I eat" and "what have I been eating", and the
   * month can only answer its one by being mostly pictures, so it replaces the
   * ring, the water and the list rather than sitting above them.
   *
   * Not persisted, for the reason `showGoals` is not: a launch landing on a month
   * grid because of a tap three days ago would be the app changing its mind about
   * what it is.
   */
  const [calendar, setCalendar] = useState(false)
  /**
   * The month the grid is showing. Seeded from the strip's day and re-seeded
   * each time the calendar opens, or coming back a week later would land on
   * last month's grid.
   */
  const [month, setMonth] = useState(() => monthStart(selectedDate))

  const showCalendar = (on: boolean) => {
    if (on) setMonth(monthStart(selectedDate))
    setCalendar(on)
  }

  const eaten = sumMacros(day.entries)

  /**
   * Whether the screen is showing the day it is named after. The strip can put
   * any earlier day here, and three pieces of copy are in the present tense: a
   * heading saying "Today" over last Tuesday's meals is the one way this can
   * actively mislead.
   */
  const isToday = selectedDate === todayKey
  const title = isToday
    ? t('logging:today.title')
    : selectedDate === yesterday(todayKey)
      ? t('common:date.yesterday')
      : format(parseISO(selectedDate), datePattern('weekdayDayMonth'))

  /**
   * Movement extends the budget and never shrinks what was eaten. `activeKcal`
   * rather than the day's total burn: the goal is already a Mifflin-St Jeor
   * figure containing basal metabolism, so resting energy would credit a user for
   * being alive twice.
   *
   * Zero on an account with no health connection.
   */
  const burned = settings?.activity_extends_budget === false ? 0 : (activity?.activeKcal ?? 0)
  const budget = (targets?.kcal ?? 0) + burned
  const left = budget - eaten.kcal
  const over = left < 0

  /**
   * Two litres until told otherwise. Unlike the calorie budget this does not wait
   * for onboarding: it is the same figure for every body, and `daily_goals`
   * defaults the column to it.
   */
  const waterGoal = targets?.waterMl ?? DEFAULT_WATER_ML

  // The row that was just added, if it landed in the last few seconds. Derived
  // rather than stored: with a server there is no "last added" flag to keep,
  // and the newest entry's timestamp says the same thing.
  const newest = day.entries.filter((entry) => !entry.status).at(-1)
  const justAdded =
    newest && Date.now() - new Date(newest.loggedAt).getTime() < ANNOUNCE_MS ? newest : undefined

  // Which entry has already been announced. A ref rather than a narrower
  // dependency list: the toast fires once per entry, and the other values the
  // effect reads are new identities on most renders.
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
        // A meal added seconds ago has no feed post to warn about.
        onPress: () =>
          queueRemove({
            id: justAdded.id,
            logDate: justAdded.logDate,
            photoPath: justAdded.photoPath,
            source: justAdded.source,
          }),
      },
    })
  }, [justAdded, toast, t, queueRemove])

  /**
   * The way back to today, and only when there is one. The strip can put any day
   * of the last year on this screen, and the month grid one twelve taps away.
   *
   * Absent on today rather than disabled: a control whose only job is to get
   * somewhere you already are has nothing to say. Bottom left, opposite the log
   * button, because those are the two corners a thumb reaches.
   *
   * Declared here because the offline screen below wants it most: a day this
   * phone has never seen is where the answer is "go back to one it has".
   */
  const backToToday = isToday ? null : (
    <Button
      size="sm"
      variant="neutral"
      onPress={() => {
        // The grid comes too, or a jump from a July calendar selects today and
        // goes on drawing July around it.
        setMonth(monthStart(todayKey))
        setSelectedDate(todayKey)
      }}
      leftIcon={<Icon set="ui" name="arrow-right" size={16} />}
      accessibilityLabel={t('logging:today.backToTodayA11y')}
    >
      {t('logging:today.title')}
    </Button>
  )

  /**
   * A day this phone has never seen, with no way to ask for it. The strip comes
   * too, so the days already saved here are one tap away. No retry and no
   * spinner, because react-query resumes a paused query by itself.
   *
   * No streak badge either: `logging_streak()` is a request like any other, and a
   * confident "0 day streak" is the wrong sentence about somebody out of signal.
   */
  if (stalled) {
    return (
      // Plain `Screen`: nothing here swipes, so this one does not need
      // gesture-handler's scroll view the way the day below does.
      <Screen floatingLeading={backToToday}>
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
    <Screen gestureScroll floatingLeading={backToToday}>
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
        /* The month on its own, with no day selected and nothing under it. A
           tap is a way to get to a day: it leaves the calendar and opens that
           day here, exactly as picking it on the week strip would. It used to
           select the day in place and list its meals and water under the grid,
           a second, smaller copy of the diary on the same screen. */
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          onSelect={(date) => {
            setSelectedDate(date)
            setCalendar(false)
          }}
          today={todayKey}
        />
      ) : (
        <>
          {/* The week, above everything it explains. A day is picked here and the
          whole screen below follows it — the ring, the water, the entries and
          anything logged while it is selected. */}
          <WeekPicker />

          {/* Less padding than a standard card. The ring and its three macro
              lines are one compact reading, and the card's own 28 points around
              them made it the tallest thing on the screen. */}
          <Card contentClassName="px-4 py-4">
            {loading ? (
              <Skeleton className="h-[112px] w-full" />
            ) : targets ? (
              <>
                {/* Tapping the summary swaps the ring from "what is left" to
                "what of the allowance is used". Both readings answer a real
                question and neither fits beside the other at this size, so they
                share the space rather than the card growing a second row. The
                macros carry both halves already, so they do not change. */}
                <Tappable
                  className={stackedSummary ? 'items-center gap-5' : 'flex-row items-center gap-4'}
                  onPress={() => setShowGoals((open) => !open)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showGoals ? t('logging:today.showLeft') : t('logging:today.showGoals')
                  }
                >
                  <CalorieRing
                    value={eaten.kcal}
                    goal={budget}
                    size={stackedSummary ? 154 : 112}
                    thickness={12}
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
                    ring leaves. One line per macro, eaten against the goal, so
                    the three rows stand no taller than the ring. */}
                  <MacroBars
                    className={stackedSummary ? 'w-full' : 'flex-1'}
                    eaten={eaten}
                    targets={targets}
                    showGoal
                    inline={!stackedSummary}
                  />
                </Tappable>

                {/* No line under the ring any more. "+360 from moving" explained
                    a budget higher than the one in Settings, and "A bit over"
                    softened a ring already reading KCAL OVER; both made the card
                    taller to say what the ring and the day list below it say.
                    The workouts that earned the extra are rows in that list. */}
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
          ) : day.entries.length === 0 &&
            sessions.length === 0 &&
            !activity ? /* No "Nothing logged yet" block. A day
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
              title={t('logging:today.dayHeading')}
              action={
                // Only when a health store reported the day. Zero steps on an
                // account with no store would be a claim about the user rather
                // than about the phone.
                activity ? (
                  <View className="flex-row items-center gap-1">
                    <Icon set="scenes" name="sneakers" size={18} />
                    <Text variant="caption" className="shrink">
                      {t('logging:today.steps', {
                        count: activity.steps,
                        steps: count(activity.steps),
                      })}
                    </Text>
                  </View>
                ) : undefined
              }
              extras={sessions.map((session) => ({
                key: session.id,
                at: session.startedAt,
                node: (
                  <SessionItem
                    session={session}
                    onPress={() =>
                      router.push({
                        pathname: '/activity/workout/[id]',
                        params: { id: session.id },
                      })
                    }
                  />
                ),
              }))}
              onPressEntry={(entry) =>
                router.push({
                  pathname: '/log/food/[id]',
                  // A `[id]` segment cannot be filled with `undefined`, and an
                  // entry's `food_id` is null whenever the scan did not land on a
                  // catalogue row, so every estimate and typed meal went to
                  // `+not-found`. The placeholder says "read it off the entry".
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
              onDeleteEntry={requestDelete}
            />
          )}
        </>
      )}
      <ConfirmSheet
        visible={Boolean(sharedDelete)}
        onClose={() => {
          setSharedDelete(null)
          // After a confirmed delete this has already been answered.
          settleDelete(false)
        }}
        title={t('logging:detail.deleteTitle')}
        description={t('social:sourceDelete')}
        confirmLabel={t('common:action.delete')}
        cancelLabel={t('common:action.keep')}
        onConfirm={async () => {
          if (!sharedDelete) return
          try {
            await deleteEntry(sharedDelete)
            settleDelete(true)
          } catch (error) {
            toast.show({ title: t('social:saveFailed'), tone: 'error' })
            throw error
          }
        }}
      />
    </Screen>
  )
}
