import { addDays, differenceInCalendarDays, format, getISODay, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { ReviewKind, ReviewRecord, ReviewWorkouts } from '@/data'
import { TrendChip } from '@/features/progress'
import { StatRow } from '@/features/shared'
import { durationText, weightText } from '@/features/workouts/format'
import { compactVolume } from '@/features/workouts/progress'
import { UNIT_KEY, type WeightUnit } from '@/lib/units'
import { Card, cn, Icon, Text } from '@/ui'
import { Shareable } from './ShareableCards'

export type TrainingStepProps = {
  kind: ReviewKind
  /** The period's first and last day. */
  start: string
  end: string
  training: ReviewWorkouts
  records: readonly ReviewRecord[]
  unit: WeightUnit
}

/**
 * The period's training: how many workouts against the period before, the
 * time and the weight moved, which days, and the new bests.
 *
 * The days are dots rather than a chart. Whether Tuesday was trained is the
 * question a training week answers, and seven dots answer it without a scale.
 * A month is the same dots laid out as its calendar.
 */
export function TrainingStep({ kind, start, end, training, records, unit }: TrainingStepProps) {
  const { t } = useTranslation(['reviews', 'common'])
  const { t: tw } = useTranslation(['workouts', 'common'])
  const delta = training.workouts - training.prevWorkouts

  return (
    <Shareable title={t('reviews:training.title')}>
      <Card contentClassName="gap-4 p-card">
        <View className="flex-row items-center gap-2">
          <Icon set="body" name="dumbbell" size={22} />
          <Text variant="overline">{t('reviews:training.title')}</Text>
        </View>

        <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <View className="flex-row items-baseline gap-2">
            <Text className="font-display text-[38px] leading-[46px] text-ink">
              {training.workouts.toLocaleString()}
            </Text>
            <Text variant="label" className="text-muted">
              {t('reviews:training.unit', { count: training.workouts })}
            </Text>
          </View>
          {delta === 0 ? null : (
            <TrendChip
              tone={delta > 0 ? 'pandan' : 'neutral'}
              direction={delta > 0 ? 'up' : 'down'}
              label={t(kind === 'week' ? 'reviews:training.vsWeek' : 'reviews:training.vsMonth', {
                delta: delta > 0 ? `+${delta}` : `${delta}`,
              })}
            />
          )}
        </View>

        <StatRow
          size="md"
          stats={[
            {
              key: 'time',
              label: t('reviews:training.time'),
              value: durationText(tw, training.durationS),
            },
            {
              key: 'volume',
              label: t('reviews:training.volume'),
              value: `${compactVolume(training.volumeKg, unit)} ${t(UNIT_KEY[unit])}`,
            },
          ]}
        />

        <DayDots kind={kind} start={start} end={end} trainedOn={training.trainedOn} />

        {records.length ? (
          <View className="gap-0">
            <Text variant="overlineSm" className="pb-1">
              {t('reviews:training.bests')}
            </Text>
            {records.map((record, index) => (
              <View
                key={record.exerciseId}
                className={cn(
                  'flex-row items-center gap-2.5 py-2',
                  index > 0 && 'border-track border-t-2',
                )}
              >
                <Icon set="system" name="trophy" size={18} />
                <Text variant="label" className="min-w-0 flex-1" numberOfLines={1}>
                  {record.name}
                </Text>
                <Text variant="label" className="text-muted">
                  {record.reps
                    ? t('reviews:training.best', {
                        weight: weightText(tw, record.weightKg, unit),
                        reps: record.reps,
                      })
                    : weightText(tw, record.weightKg, unit)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </Shareable>
  )
}

/**
 * One dot per day of the period, filled where a workout was logged. A week is
 * a row of seven under their initials; a month is its calendar, Monday first,
 * with the days before the 1st left blank so each column stays one weekday.
 */
function DayDots({
  kind,
  start,
  end,
  trainedOn,
}: {
  kind: ReviewKind
  start: string
  end: string
  trainedOn: readonly string[]
}) {
  const { t } = useTranslation('reviews')
  const first = parseISO(start)
  const length = differenceInCalendarDays(parseISO(end), first) + 1
  const days = Array.from({ length }, (_, index) => format(addDays(first, index), 'yyyy-MM-dd'))
  const trained = new Set(trainedOn)
  const size = kind === 'week' ? 14 : 10
  // Blanks before the 1st: Monday is 1, so a month opening on a Thursday has three.
  const lead = kind === 'month' ? getISODay(first) - 1 : 0
  const cells: (string | null)[] = [...Array.from({ length: lead }, () => null), ...days]
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    format(addDays(parseISO('2024-01-01'), index), 'EEEEE'),
  )

  return (
    <View
      className="gap-1.5"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('training.days', { done: trained.size, total: days.length })}
    >
      <View className="flex-row">
        {weekdays.map((initial, index) => (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: seven fixed columns
            key={index}
            variant="micro"
            className="flex-1 text-center"
          >
            {initial}
          </Text>
        ))}
      </View>
      <View className="flex-row flex-wrap" style={{ rowGap: kind === 'week' ? 0 : 6 }}>
        {cells.map((day, index) => (
          <View
            key={day ?? `lead-${index}`}
            className="items-center"
            style={{ width: `${100 / 7}%` }}
          >
            {day === null ? null : (
              <View
                className={cn(
                  'rounded-full',
                  trained.has(day) ? 'bg-hibiscus' : 'border-2 border-line-strong',
                )}
                style={{ width: size, height: size }}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  )
}
