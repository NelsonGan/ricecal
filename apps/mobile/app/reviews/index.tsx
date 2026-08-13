import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type ReviewKind, useReviewPeriods, useSettings } from '@/data'
import { unitFor } from '@/features/progress'
import { ReviewRow, reviewId } from '@/features/reviews'
import { useBack } from '@/lib/navigation'
import { AppBar, Card, EmptyState, Screen, SegmentedControl, Skeleton } from '@/ui'

/**
 * The reviews list: finished weeks, or finished months.
 *
 * TWO WINDOWS, and they are different lengths on purpose. Weeks reach three
 * months back and months reach six, because a weekly review is about something
 * you still remember eating and a monthly one is about a shape you only see
 * from a distance. Both are decided in `review_periods`; nothing here knows a
 * date.
 *
 * EVERY PERIOD IN THE WINDOW, however little is in it. There was a sufficiency
 * rule here — four logged days of a week, twelve of a month — and periods that
 * failed it were dropped. Two things were wrong with that: the week you barely
 * logged is the week whose shape is worth seeing, and a list that silently
 * omits some weeks reads as a list that lost them. The sparkline already says
 * how much of a period was recorded, which is what the rule was trying to
 * protect against.
 */
export default function ReviewsScreen() {
  const { t } = useTranslation(['reviews', 'common'])
  const back = useBack('/(tabs)/trends')

  const [kind, setKind] = useState<ReviewKind>('week')
  const periods = useReviewPeriods(kind)
  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)

  const listed = periods.data ?? []

  return (
    <Screen>
      <AppBar title={t('reviews:title')} onBack={back} backLabel={t('common:action.back')} />

      <SegmentedControl
        options={[
          { value: 'week', label: t('reviews:kind.week') },
          { value: 'month', label: t('reviews:kind.month') },
        ]}
        value={kind}
        onChange={setKind}
        accessibilityLabel={t('reviews:kind.label')}
      />

      {periods.isPending ? (
        <Card>
          <Skeleton className="h-[220px] w-full" />
        </Card>
      ) : listed.length === 0 ? (
        <Card>
          <EmptyState
            title={
              kind === 'week' ? t('reviews:list.emptyWeekTitle') : t('reviews:list.emptyMonthTitle')
            }
            description={
              kind === 'week' ? t('reviews:list.emptyWeekBody') : t('reviews:list.emptyMonthBody')
            }
            icon={{ set: 'ui', name: 'calendar-view' }}
          />
        </Card>
      ) : (
        <Card contentClassName="gap-0 p-card">
          {listed.map((period, index) => (
            <ReviewRow
              key={period.start}
              period={period}
              unit={unit}
              latest={index === 0}
              divider={index < listed.length - 1}
              onPress={() => router.push(`/reviews/${reviewId(period.kind, period.start)}`)}
            />
          ))}
        </Card>
      )}
    </Screen>
  )
}
