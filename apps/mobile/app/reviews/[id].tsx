import { router, useLocalSearchParams } from 'expo-router'
import { type ReactNode, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  useEntitlement,
  useReviewMeals,
  useReviewPeriods,
  useReviewSeries,
  useReviewSummary,
  useSettings,
} from '@/data'
import {
  BodyStep,
  CaloriesStep,
  CardStep,
  FoodStep,
  LATEST,
  parseReviewId,
  periodShortTitle,
  type ReviewStep,
  reviewSteps,
  ShareableCards,
} from '@/features/reviews'
import { track } from '@/lib/analytics'
import { useBack } from '@/lib/navigation'
import { unitFor } from '@/lib/units'
import { spacing } from '@/theme/tokens'
import { AppBar, Card, EmptyState, Screen, Skeleton } from '@/ui'

/**
 * One review, read as a column of cards.
 *
 * THE ID CARRIES EVERYTHING. `week-2026-08-03` names the kind and the first
 * day, and the server works the last day out from those two — so this screen
 * does no date arithmetic at all, and a deep link into a review is a link that
 * still means the same thing next month.
 *
 * Three requests, and the fourth is free: the summary, the chart columns and
 * the dish list are this period's, while the list of every period is the same
 * query the screen behind this one already made, so the comparison chart on the
 * calorie card costs nothing when the review was opened from the list and one
 * small request when it was opened from a link.
 *
 * HOW MANY SECTIONS THERE ARE IS STILL DATA. `reviewSteps` decides it from what
 * came back, so a month before the watch arrived is three sections rather than
 * four with an empty one at the end.
 */
export default function ReviewScreen() {
  const { t } = useTranslation(['reviews', 'common'])
  const { id } = useLocalSearchParams<{ id: string }>()
  const back = useBack('/reviews')

  const period = parseReviewId(id)
  const kind = period?.kind ?? 'week'

  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)

  const periods = useReviewPeriods(kind)

  /**
   * Which period this actually is.
   *
   * Usually the date in the route. `LATEST` is the other case, and it is what a
   * report notification links to: one is scheduled weeks before the Monday it
   * fires on, so it cannot name the week it will be about. The list is ordered
   * newest first, so its head IS that week.
   */
  const start =
    period === null ? '' : period.start === LATEST ? (periods.data?.[0]?.start ?? '') : period.start

  // Every hook above the first return, and `enabled` rather than an early exit
  // inside them: an unparseable id is a screen state rather than a different
  // screen, and so is a `latest` that has not resolved yet.
  const summary = useReviewSummary(kind, start)
  const series = useReviewSeries(kind, start)
  const meals = useReviewMeals(kind, start)

  /**
   * One `Review Opened` per review, once the period is actually known.
   *
   * Waiting on `start` matters: a report notification links to `week-latest`,
   * which resolves against the list a request later, so tracking on mount would
   * fire for a screen that is still deciding what it is about. Keyed on the
   * resolved start so a `latest` and the dated route it turns into are one view
   * rather than two.
   */
  const openedPeriod = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!start || openedPeriod.current === start) return
    openedPeriod.current = start
    track('Review Opened', { kind })
  }, [start, kind])

  /**
   * The same gate the list applies, applied again here.
   *
   * The list is not the only way in. A monthly report notification links
   * straight to `month-latest`, a shared link names a week by date, and neither
   * goes through a row that could have refused it — so a free account would
   * otherwise read a locked review by tapping a notification.
   *
   * `replace`, not `push`. Pushed, the back gesture off the paywall lands on
   * this screen again, which redirects again: a loop the user cannot leave.
   *
   * Waits for EVERY answer. `entitled` is false while the subscription query is
   * in flight and false again when the app is offline with nothing cached, and
   * acting on either would take a paying user off the review they just opened —
   * on every cold launch, or every time they read it on a train. `unknown` is
   * the offline case and it is why this reads all three: "we could not check"
   * must never be answered with "you have not paid". The same is true of the
   * period list on the `latest` path, where "is this the newest week" cannot be
   * answered until it lands — hence `periods.isPending` rather than only
   * `start`.
   */
  const { entitled, loading: checkingPlan, unknown: planUnknown } = useEntitlement()
  const locked =
    !entitled &&
    !checkingPlan &&
    !planUnknown &&
    !periods.isPending &&
    start !== '' &&
    !(kind === 'week' && start === periods.data?.[0]?.start)

  useEffect(() => {
    if (!locked) return
    track('Paywall Shown', { screen: 'hard', trigger: 'review' })
    router.replace('/paywall')
  }, [locked])

  if (!period) return <Missing />

  const resolving = period.start === LATEST && periods.isPending
  // `locked` draws the skeleton rather than the review while the replace above
  // takes effect. A frame of somebody else's paid feature is still the feature.
  const loading =
    locked ||
    resolving ||
    (start !== '' && (summary.isPending || series.isPending || meals.isPending))
  const found = summary.data

  if (loading) {
    return (
      <Screen>
        {/* The bar is here rather than only under the loaded review, because a
            request that is slow, or retrying against a network that is not
            there, would otherwise be a screen with no way off it. */}
        <AppBar title={t('reviews:title')} onBack={back} backLabel={t('common:action.back')} />
        <Card>
          <Skeleton className="h-[320px] w-full" />
        </Card>
      </Screen>
    )
  }

  // An EMPTY period still gets a review. It used to be turned away here, and
  // that was the same instinct as the sufficiency rule on the list: a week
  // nobody logged is a week worth seeing seven hollow blocks for. `reviewSteps`
  // already drops the sections that would have nothing on them.
  if (!found) return <Missing />

  const title = periodShortTitle(kind, found.start, found.end)
  const buckets = series.data ?? []
  const dishes = meals.data ?? []
  const steps = reviewSteps(found, dishes.length)

  const draw: Record<ReviewStep, ReactNode> = {
    card: <CardStep title={title} summary={found} buckets={buckets} unit={unit} />,
    food: <FoodStep summary={found} meals={dishes} />,
    calories: (
      <CaloriesStep kind={kind} summary={found} buckets={buckets} periods={periods.data ?? []} />
    ),
    body: <BodyStep kind={kind} summary={found} buckets={buckets} unit={unit} />,
  }

  return (
    /* Around the whole page rather than around each card, because the cards are
       elements this screen builds: context reaches them by where they are
       RENDERED, and the sentence a share carries is one this screen knows and a
       card does not. */
    <ShareableCards
      message={t('reviews:card.shareText', {
        period: title,
        kcal: Math.round(found.kcal ?? 0).toLocaleString(),
        done: found.daysLogged,
        total: found.days,
      })}
      onShared={() => track('Review Card Shared', { kind })}
    >
      <Screen>
        <AppBar title={title} onBack={back} backLabel={t('common:action.back')} />

        {/* A section is one or more cards about one thing, and it is wrapped so
            that the space between two cards of a section and the space between
            two sections are the same. They are not the same THING — the seam
            between food and calories is a change of subject — but a column of
            cards is read by the cards, and a second gap size would be the page
            claiming a structure the reader has no use for. */}
        {steps.map((step) => (
          <View key={step} style={{ gap: spacing.stack }}>
            {draw[step]}
          </View>
        ))}
      </Screen>
    </ShareableCards>
  )
}

/**
 * An id that does not name a review anybody can read.
 *
 * Two ways to arrive: a link that was edited or has aged out of the window, and
 * a period whose days were deleted after the list was drawn. Both are the same
 * sentence, and neither is an error worth a red screen.
 */
function Missing() {
  const { t } = useTranslation(['reviews', 'common'])
  const back = useBack('/reviews')

  return (
    <Screen>
      <AppBar title={t('reviews:title')} onBack={back} backLabel={t('common:action.back')} />
      <View className="flex-1 justify-center">
        <Card>
          <EmptyState
            title={t('reviews:story.missingTitle')}
            description={t('reviews:story.missingBody')}
            icon={{ set: 'ui', name: 'calendar-view' }}
          />
        </Card>
      </View>
    </Screen>
  )
}
