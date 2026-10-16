import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useWindowDimensions, View } from 'react-native'

import { type HrZones, ZONE_KEY, ZONE_ORDER, type ZoneName } from '@/lib/health'
import { Card, cn, Icon, Text } from '@/ui'
import { clock } from './format'

const ZONE_FILL: Record<ZoneName, string> = {
  easy: 'bg-water',
  steady: 'bg-pandan',
  hard: 'bg-kaya',
  peak: 'bg-hibiscus',
}

/**
 * A workout's heart rate: the average and the maximum, then the time in each
 * of the four zones. One card for both kinds of workout page, a session the
 * health store reported and a gym workout the watch recorded, which can also
 * hand it a `chart` of the readings to draw between the two.
 */
export function HeartRateCard({
  avgHr,
  maxHr,
  zones,
  chart,
}: {
  avgHr: number | null
  maxHr: number | null
  zones: HrZones | null
  chart?: ReactNode
}) {
  const { t } = useTranslation(['activity'])
  const { fontScale } = useWindowDimensions()
  const wideText = fontScale > 1.3
  const zoneTotal = zones ? ZONE_ORDER.reduce((sum, zone) => sum + zones[zone], 0) : 0

  return (
    <Card contentClassName="gap-4">
      <View className="flex-row items-center gap-2">
        <Icon set="body" name="heart-rate" size={24} />
        <Text variant="subtitle" className="flex-1">
          {t('activity:workout.heartRate')}
        </Text>
      </View>
      {avgHr != null || maxHr != null ? (
        <View className={wideText ? 'gap-3' : 'flex-row'}>
          {avgHr != null ? (
            <HeartMetric
              label={t('activity:workout.avgHr')}
              value={avgHr}
              className={!wideText ? 'flex-1' : undefined}
            />
          ) : null}
          {maxHr != null ? (
            <HeartMetric
              label={t('activity:workout.maxHr')}
              value={maxHr}
              className={cn(
                !wideText && 'flex-1',
                avgHr != null
                  ? wideText
                    ? 'border-line border-t pt-3'
                    : 'ml-4 border-line border-l pl-4'
                  : undefined,
              )}
            />
          ) : null}
        </View>
      ) : null}

      {chart}

      {zones && zoneTotal > 0 ? (
        <View className="gap-3 border-line border-t pt-4">
          <Text variant="overlineSm">{t('activity:workout.zonesTitle')}</Text>
          {ZONE_ORDER.map((zone) => (
            <View
              key={zone}
              className={wideText ? 'gap-1.5' : 'flex-row items-center gap-3'}
              accessible
              accessibilityLabel={`${t(ZONE_KEY[zone])}, ${clock(zones[zone])}`}
            >
              <View
                className={wideText ? 'flex-row items-center justify-between gap-3' : 'w-[72px]'}
              >
                <Text variant="caption" className="shrink text-body">
                  {t(ZONE_KEY[zone])}
                </Text>
                {wideText ? <Text variant="label">{clock(zones[zone])}</Text> : null}
              </View>
              <View
                className={cn('h-2.5 overflow-hidden rounded-full bg-track', !wideText && 'flex-1')}
              >
                <View
                  className={cn('h-full rounded-full', ZONE_FILL[zone])}
                  style={{ width: `${(zones[zone] / zoneTotal) * 100}%` }}
                />
              </View>
              {!wideText ? (
                <Text variant="label" className="min-w-[60px] text-right">
                  {clock(zones[zone])}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  )
}

function HeartMetric({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className?: string
}) {
  const { t } = useTranslation('activity')
  return (
    <View
      className={cn('min-w-0 gap-1', className)}
      accessible
      accessibilityLabel={`${label}, ${t('workout.bpm', { value })}`}
    >
      {/* Label over figure, as every other measurement on the page reads. */}
      <Text variant="overlineSm" className="text-muted">
        {label}
      </Text>
      <Text
        variant="displayMd"
        className="text-hibiscus-ink"
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
        <Text variant="caption" className="text-hibiscus-ink">
          {' '}
          {t('workout.bpmUnit')}
        </Text>
      </Text>
    </View>
  )
}
