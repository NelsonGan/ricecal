import { useTranslation } from 'react-i18next'

/**
 * "45 min", "1 h", "1 h 10 min": a recipe's time as words. Borrows the
 * workout's phrasing, which is already in every language and is the same
 * question (how long is this going to take) asked of the stove.
 */
export function useDurationText() {
  const { t } = useTranslation('workouts')
  return (totalMinutes: number) => {
    const minutes = Math.max(0, Math.round(totalMinutes))
    const span = { hours: Math.floor(minutes / 60), minutes: minutes % 60 }
    if (span.hours > 0 && span.minutes > 0) return t('duration.hoursMinutes', span)
    if (span.hours > 0) return t('duration.hours', span)
    return t('duration.minutes', { minutes: span.minutes })
  }
}
