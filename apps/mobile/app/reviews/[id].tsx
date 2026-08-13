import { useLocalSearchParams } from 'expo-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  useReviewMeals,
  useReviewPeriods,
  useReviewSeries,
  useReviewSummary,
  useSettings,
} from '@/data'
import { unitFor } from '@/features/progress'
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
  StoryFrame,
  type StoryPage,
} from '@/features/reviews'
import { useBack } from '@/lib/navigation'
import { AppBar, Card, EmptyState, Screen, Skeleton } from '@/ui'

/**
 * One review, read as a story.
 *
 * THE ID CARRIES EVERYTHING. `week-2026-08-03` names the kind and the first
 * day, and the server works the last day out from those two — so this screen
 * does no date arithmetic at all, and a deep link into a review is a link that
 * still means the same thing next month.
 *
 * Three requests, and the fourth is free: the summary, the chart columns and
 * the dish list are this period's, while the list of every period is the same
 * query the screen behind this one already made, so the comparison chart on
 * step three costs nothing when the story was opened from the list and one
 * small request when it was opened from a link.
 *
 * HOW MANY STEPS THERE ARE IS DATA. `reviewSteps` decides it from what came
 * back, so a month before the watch arrived is three steps rather than four
 * with an empty one at the end. The progress bar counts what it is given.
 */
export default function ReviewStoryScreen() {
  const { t } = useTranslation(['reviews', 'common'])
  const { id } = useLocalSearchParams<{ id: string }>()
  const close = useBack('/reviews')

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

  if (!period) return <Missing />

  const resolving = period.start === LATEST && periods.isPending
  const loading =
    resolving || (start !== '' && (summary.isPending || series.isPending || meals.isPending))
  const found = summary.data

  if (loading) {
    return (
      <Screen>
        {/* The bar is here rather than only under the loaded story, because
            this presents full screen: without it a request that is slow, or
            retrying against a network that is not there, is a screen with no
            way off it. */}
        <AppBar
          title={t('reviews:title')}
          onBack={close}
          leading="dismiss"
          backLabel={t('reviews:story.close')}
        />
        <Card>
          <Skeleton className="h-[320px] w-full" />
        </Card>
      </Screen>
    )
  }

  // An EMPTY period still gets a review. It used to be turned away here, and
  // that was the same instinct as the sufficiency rule on the list: a week
  // nobody logged is a week worth seeing seven hollow blocks for. `reviewSteps`
  // already drops the steps that would have nothing on them.
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

  const pages: StoryPage[] = steps.map((step) => ({ key: step, node: draw[step] }))

  return (
    /* Around the frame rather than inside it, because the pages are elements
       this screen builds: context reaches them by where they are RENDERED,
       which is inside the provider either way, and the sentence a share carries
       is one this screen knows and the frame does not. */
    <ShareableCards
      message={t('reviews:card.shareText', {
        period: title,
        kcal: Math.round(found.kcal ?? 0).toLocaleString(),
        done: found.daysLogged,
        total: found.days,
      })}
    >
      <StoryFrame
        // Keyed by the review, so opening a second one from the first's
        // comparison chart starts at its first card with the pager wound back.
        // Expo Router reuses this route when only the params move, and a frame
        // that survived that would keep the scroll position of the story before
        // it.
        key={id}
        title={title}
        pages={pages}
        onClose={close}
        labels={{
          close: t('reviews:story.close'),
          previous: t('reviews:story.previous'),
          next: t('reviews:story.next'),
          progress: t('reviews:title'),
        }}
        counter={(at, total) => t('reviews:story.step', { index: at + 1, total })}
      />
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
  const close = useBack('/reviews')

  return (
    <Screen>
      <AppBar
        title={t('reviews:title')}
        onBack={close}
        leading="dismiss"
        backLabel={t('reviews:story.close')}
      />
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
