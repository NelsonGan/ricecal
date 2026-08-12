import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Share, View } from 'react-native'

import type { ReviewBucket, ReviewKind, ReviewSummary } from '@/data'
import { showChange, type WeightUnit } from '@/features/progress'
import { StatRow } from '@/features/shared'
import { Badge, Button, Card, cn, Icon, Text } from '@/ui'

export type CardStepProps = {
  title: string
  summary: ReviewSummary
  buckets: readonly ReviewBucket[]
  unit: WeightUnit
}

/**
 * Step 1: the whole period on one card, and the only step meant to leave the
 * app.
 *
 * Everything on it is a headline — the average, how it sat against the budget,
 * which days were logged, the streak, the change on the scale — and nothing on
 * it is a chart. That is what makes it shareable: a card somebody screenshots
 * has to be readable at the size a chat window shows it, and a seven-column
 * stacked bar is not.
 *
 * The marks are presence rather than amount. A filled block is a day with food
 * logged and a hollow one is a day without, which is the one thing a person
 * looking back at their own week wants to see first, and it stays true whether
 * the week averaged 1,400 or 2,600.
 *
 * SHARING SENDS A SENTENCE, not a picture. Rendering the card to an image would
 * mean a second drawing of it that has to agree with this one, and the two
 * drift the first time a figure moves. The sentence carries the same three
 * numbers.
 */
export function CardStep({ title, summary, buckets, unit }: CardStepProps) {
  const { t } = useTranslation(['reviews', 'common'])

  const goal = summary.kcalGoal
  const average = summary.kcal
  /** Positive is under budget, which is the direction the arrow points. */
  const delta = goal !== null && average !== null ? Math.round(goal - average) : null

  const share = () => {
    void Share.share({
      message: t('reviews:card.shareText', {
        period: title,
        kcal: Math.round(average ?? 0).toLocaleString(),
        done: summary.daysLogged,
        total: summary.days,
      }),
    })
  }

  return (
    <>
      <Card contentClassName="gap-md p-card">
        <View className="flex-row items-center justify-between gap-md">
          <Text variant="overline" numberOfLines={1} className="min-w-0 flex-1">
            {title}
          </Text>
          {delta === null ? null : (
            <Badge tone={delta >= 0 ? 'pandan' : 'kaya'} className="px-3 py-1.5">
              <Icon set="body" name={delta >= 0 ? 'trend-down' : 'trend-up'} size={16} />
              <Text
                variant="caption"
                numberOfLines={1}
                className={delta >= 0 ? 'text-pandan-ink' : 'text-kaya-ink'}
              >
                {delta === 0
                  ? t('reviews:card.onBudget')
                  : delta > 0
                    ? t('reviews:card.under', { value: delta.toLocaleString() })
                    : t('reviews:card.over', { value: Math.abs(delta).toLocaleString() })}
              </Text>
            </Badge>
          )}
        </View>

        <View className="flex-row items-baseline gap-2">
          <Text className="font-display text-[46px] leading-[56px] text-ink">
            {Math.round(average ?? 0).toLocaleString()}
          </Text>
          <Text variant="label" className="text-muted">
            {t('reviews:card.kcalADay')}
          </Text>
        </View>

        <View className="flex-row items-stretch gap-1.5">
          {buckets.map((bucket, position) => (
            <View key={bucket.start} className="min-w-0 flex-1 items-center gap-1.5">
              <View
                className={cn(
                  'h-[46px] w-full rounded-lg',
                  bucket.daysLogged > 0 ? 'bg-pandan' : 'bg-track',
                )}
              />
              {/* The initial under each block, because a row of seven marks with
                  nothing under it has to be counted rather than read: which of
                  them is Saturday is the whole question somebody asks of a gap. */}
              <Text variant="micro" numberOfLines={1}>
                {markLabel(summary.kind, bucket.start, position)}
              </Text>
            </View>
          ))}
        </View>

        <StatRow
          size="md"
          stats={[
            {
              key: 'logged',
              label: t('reviews:card.logged'),
              value: t('reviews:card.loggedValue', {
                done: summary.daysLogged,
                total: summary.days,
              }),
            },
            {
              key: 'streak',
              label: t('reviews:card.streak'),
              value: t('reviews:card.streakValue', { count: summary.streakDays }),
            },
            {
              // Short on purpose. "WEIGHT CHANGE" wraps to two lines on a 393pt
              // phone, and a two-line label under one of three stats pushes its
              // figure out of line with the other two.
              key: 'weight',
              label: t('reviews:card.weightChange'),
              value:
                summary.weightChange === null
                  ? t('reviews:card.noWeight')
                  : `${showChange(summary.weightChange, unit)} ${t(`common:unit.${unit}`)}`,
            },
          ]}
        />

        {/* The app's own name, because this card is the one thing here that
            gets screenshotted and sent to somebody who does not have it. */}
        <Text variant="overlineSm">{t('reviews:card.brand')}</Text>
      </Card>

      {/* Sized rather than full width, and centred, so it sits clear of the tap
          zones either side of it. A full-width button under a story's card is
          also the one control somebody hits while trying to move on. */}
      <Button variant="primary" size="md" className="self-center" onPress={share}>
        {t('reviews:story.share')}
      </Button>
    </>
  )
}

/**
 * What goes under one block: a weekday initial, or a week number.
 *
 * A month has four or five blocks rather than seven, and "W1" is the only thing
 * either of them can be called — the ISO week's own number would be 32 for the
 * first week of August, which is a fact about the year rather than about the
 * month being read.
 */
function markLabel(kind: ReviewKind, start: string, position: number): string {
  if (kind === 'week') return format(parseISO(start), 'EEEEE')
  return `W${position + 1}`
}
