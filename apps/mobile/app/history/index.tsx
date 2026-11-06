import { Redirect, useLocalSearchParams } from 'expo-router'

import type { HistoryMetric } from '@/data'
import { HISTORY_METRICS } from '@/features/progress'

/**
 * `/history?metric=` was one page with tabs, and a link saved from then still
 * means the same list. It goes to that metric's own page.
 */
export default function HistoryIndexRoute() {
  const { metric } = useLocalSearchParams<{ metric?: string }>()
  const target: HistoryMetric = HISTORY_METRICS.includes(metric as HistoryMetric)
    ? (metric as HistoryMetric)
    : 'calories'
  return <Redirect href={`/history/${target}`} />
}
