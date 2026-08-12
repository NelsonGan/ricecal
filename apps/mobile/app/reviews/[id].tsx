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
  parseReviewId,
  periodShortTitle,
  type ReviewStep,
  reviewSteps,
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

  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)

  // `enabled` rather than an early return: the hooks below have to be called in
  // the same order on every render, and an unparseable id is a screen state
  // rather than a different screen.
  const summary = useReviewSummary(period?.kind ?? 'week', period?.start ?? '')
  const series = useReviewSeries(period?.kind ?? 'week', period?.start ?? '')
  const meals = useReviewMeals(period?.kind ?? 'week', period?.start ?? '')
  const periods = useReviewPeriods(period?.kind ?? 'week')

  if (!period) return <Missing />

  const loading = summary.isPending || series.isPending || meals.isPending
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

  // A period with nothing in it has a row of nulls rather than no row, so the
  // test is on the days rather than on the answer being absent.
  if (!found || found.daysLogged === 0) return <Missing />

  const title = periodShortTitle(period.kind, found.start, found.end)
  const buckets = series.data ?? []
  const dishes = meals.data ?? []
  const steps = reviewSteps(found, dishes.length)

  const draw: Record<ReviewStep, ReactNode> = {
    card: <CardStep title={title} summary={found} buckets={buckets} unit={unit} />,
    food: <FoodStep summary={found} meals={dishes} />,
    calories: (
      <CaloriesStep
        kind={period.kind}
        summary={found}
        buckets={buckets}
        periods={periods.data ?? []}
      />
    ),
    body: <BodyStep kind={period.kind} summary={found} buckets={buckets} unit={unit} />,
  }

  const pages: StoryPage[] = steps.map((step) => ({ key: step, node: draw[step] }))

  return (
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
