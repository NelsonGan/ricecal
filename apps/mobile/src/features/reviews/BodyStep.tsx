import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { ReviewBucket, ReviewKind, ReviewSummary } from '@/data'
import { showChange, showWeight, TrendLine, type WeightUnit } from '@/features/progress'
import { BarChart } from '@/features/shared'
import { Badge, Card, Divider, Icon, Text } from '@/ui'
import { Shareable } from './ShareableCards'

export type BodyStepProps = {
  kind: ReviewKind
  summary: ReviewSummary
  buckets: readonly ReviewBucket[]
  unit: WeightUnit
}

/**
 * Step 4: the scale, the steps, and everything else that got recorded.
 *
 * EVERY CARD HERE IS CONDITIONAL, which is the whole reason this step exists
 * separately from the calorie one. A review of a month before the watch arrived
 * has a weight line and nothing under it; a user who never stands on a scale has
 * steps and nothing above them; somebody with neither never reaches this step at
 * all, because `reviewSteps` drops it and the progress bar counts three.
 *
 * The alternative — drawing all three and letting two of them say "no data" —
 * turns a look back at a good month into a list of things the user did not do.
 */
export function BodyStep({ kind, summary, buckets, unit }: BodyStepProps) {
  const { t } = useTranslation(['reviews', 'common', 'progress'])

  const hasWeight = summary.weighIns > 0 && summary.weightLast !== null
  const hasSteps = summary.activeDays > 0

  const distanceKm = summary.distanceM / 1000

  return (
    <>
      {hasWeight ? (
        <Shareable title={t('reviews:body.weight')}>
          <Card contentClassName="gap-2 p-card">
            {/* See `CaloriesStep`: sixteen points under every heading. */}
            <Text variant="overline" className="mb-2">
              {t('reviews:body.weight')}
            </Text>

            <View className="flex-row items-end justify-between gap-md">
              <View className="flex-row items-baseline gap-2">
                <Text className="font-display text-[34px] leading-[42px] text-ink">
                  {showWeight(summary.weightLast ?? 0, unit)}
                </Text>
                <Text variant="label" className="text-muted">
                  {t(`common:unit.${unit}`)}
                </Text>
              </View>

              {summary.weightChange === null ? null : (
                <Badge tone={summary.weightChange <= 0 ? 'pandan' : 'kaya'} className="px-3 py-1.5">
                  <Icon
                    set="body"
                    name={summary.weightChange <= 0 ? 'trend-down' : 'trend-up'}
                    size={16}
                  />
                  <Text
                    variant="caption"
                    numberOfLines={1}
                    className={summary.weightChange <= 0 ? 'text-pandan-ink' : 'text-kaya-ink'}
                  >
                    {`${showChange(summary.weightChange, unit)} ${t(`common:unit.${unit}`)}`}
                  </Text>
                </Badge>
              )}
            </View>

            <TrendLine
              height={78}
              points={buckets.map((bucket) => ({
                key: bucket.start,
                label: '',
                value: bucket.weight,
              }))}
              // What the period opened at, so a line whose first weigh-in is on
              // Wednesday still starts at the left edge rather than partway
              // across. Recovered rather than fetched: the change is measured
              // from exactly that reading, so the last weight less the change IS
              // it — and where there was no earlier reading the change was
              // measured from the first one inside the period, which puts the
              // line's start on its own first point and draws the same shape.
              carryFrom={
                summary.weightLast !== null && summary.weightChange !== null
                  ? summary.weightLast - summary.weightChange
                  : null
              }
              accessibilityLabel={t('reviews:body.weightChart')}
            />

            <Text variant="meta">{t('reviews:body.weighIns', { count: summary.weighIns })}</Text>
          </Card>
        </Shareable>
      ) : null}

      {hasSteps ? (
        <Shareable title={t('reviews:body.steps')}>
          <Card contentClassName="gap-2 p-card">
            <Text variant="overline" className="mb-2">
              {t('reviews:body.steps')}
            </Text>

            <View className="flex-row items-baseline justify-between gap-md">
              <Text className="font-display text-[30px] leading-[38px] text-ink">
                {Math.round(summary.steps ?? 0).toLocaleString()}
              </Text>
              {summary.stepGoal ? (
                <Text variant="meta" numberOfLines={1} className="min-w-0 shrink">
                  {t('reviews:body.stepGoal', {
                    done: summary.stepGoalDays,
                    total: summary.days,
                    goal: summary.stepGoal.toLocaleString(),
                  })}
                </Text>
              ) : null}
            </View>

            <BarChart
              height={78}
              bars={buckets.map((bucket, position) => ({
                key: bucket.start,
                label:
                  kind === 'week'
                    ? format(parseISO(bucket.start), 'EEEEE')
                    : t('progress:range.week', { index: position + 1 }),
                value: Math.round(bucket.steps ?? 0),
                // Green where the goal was met, grey where it was not, which is
                // the same reading the Activity tab gives a day.
                highlight: (bucket.steps ?? 0) >= (summary.stepGoal ?? 0),
              }))}
              accessibilityLabel={t('reviews:body.stepsChart')}
            />
          </Card>
        </Shareable>
      ) : null}

      <Shareable title={t('reviews:body.others')}>
        {/* See `FoodStep`: a `gap-0` card owes its header the space back. */}
        <Card title={t('reviews:body.others')} contentClassName="gap-0 p-card">
          <View className="mt-4" />
          <OtherRow
            label={t('reviews:body.water')}
            note={t('reviews:body.waterNote', { count: summary.waterGoalDays })}
            value={t('reviews:body.waterValue', { value: summary.water.toFixed(1) })}
          />
          {hasSteps ? (
            <>
              <Divider className="my-3" />
              <OtherRow
                label={t('reviews:body.move')}
                note={
                  summary.sessions > 0
                    ? t('reviews:body.moveNote', { count: summary.sessions })
                    : t('reviews:body.moveNoteNone')
                }
                value={summary.exerciseMinutes.toLocaleString()}
              />
              <Divider className="my-3" />
              <OtherRow
                label={t('reviews:body.burn')}
                note={t('reviews:body.distanceValue', { value: distanceKm.toFixed(1) })}
                value={t('reviews:body.burnValue', {
                  value: Math.round(summary.activeKcal ?? 0).toLocaleString(),
                })}
              />
            </>
          ) : null}
        </Card>
      </Shareable>
    </>
  )
}

function OtherRow({ label, note, value }: { label: string; note?: string; value: string }) {
  return (
    <View className="flex-row items-center gap-md">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="label" className="text-ink">
          {label}
        </Text>
        {note ? (
          <Text variant="meta" numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      <Text variant="label" className="text-ink">
        {value}
      </Text>
    </View>
  )
}
