import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type ReviewKind, useEntitlement, useReviewPeriods, useSettings } from '@/data'
import { useRequirePro } from '@/features/paywall'
import { ReviewRow, reviewId } from '@/features/reviews'
import { useBack } from '@/lib/navigation'
import { unitFor } from '@/lib/units'
import { AppBar, Card, EmptyState, Screen, SegmentedControl, Skeleton } from '@/ui'

/**
 * The reviews list: finished weeks, or finished months.
 *
 * Two windows of different lengths. Weeks reach three months back and months
 * reach six, because a weekly review is about something you still remember eating
 * and a monthly one is about a shape you only see from a distance. Both are
 * decided in `review_periods`; nothing here knows a date.
 *
 * The newest week is free. A free account gets to read one review rather than be
 * told about one, and it is the newest week rather than a sample because the
 * sample would be somebody else's week. Everything older, and every month, opens
 * the paywall, with the rows still drawn in full and a padlock where the chevron
 * goes.
 *
 * Every period in the window is listed, however little is in it. There was a
 * sufficiency rule here (four logged days of a week, twelve of a month) and it
 * was wrong twice: the week you barely logged is the week whose shape is worth
 * seeing, and a list that silently omits weeks reads as one that lost them. The
 * sparkline already says how much of a period was recorded.
 */
export default function ReviewsScreen() {
  const { t } = useTranslation(['reviews', 'common'])
  const back = useBack('/(tabs)/trends')

  const [kind, setKind] = useState<ReviewKind>('week')
  const periods = useReviewPeriods(kind)
  const { data: settings } = useSettings()
  const { entitled, loading: checkingPlan, unknown: planUnknown } = useEntitlement()
  const requirePro = useRequirePro()
  const unit = unitFor(settings?.units)

  const listed = periods.data ?? []

  /**
   * The one review a free account may open: the newest finished week.
   *
   * "Not yet known" counts as free, so no padlock is drawn while the
   * subscription query is in flight or while the app is offline with nothing
   * cached. A row that shows a lock for a moment on every cold launch is a
   * paying user being told twice a day that they have not paid; the tap is
   * still guarded by `requirePro`, which says "we could not check" rather than
   * refusing when it does not know.
   */
  const known = !checkingPlan && !planUnknown
  const isFree = (index: number) => !known || entitled || (kind === 'week' && index === 0)

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
              locked={!isFree(index)}
              divider={index < listed.length - 1}
              onPress={() => {
                // `requirePro` rather than the `entitled` above, because it is
                // the one that knows the difference between "not subscribed"
                // and "we could not find out" — and offline, a locked row must
                // say the second rather than the first.
                if (!isFree(index) && !requirePro('review')) return
                router.push(`/reviews/${reviewId(period.kind, period.start)}`)
              }}
            />
          ))}
        </Card>
      )}
    </Screen>
  )
}
