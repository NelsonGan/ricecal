import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useWindowDimensions, View } from 'react-native'

import type { ActivitySession } from '@/data'
import { datePattern } from '@/lib/dates'
import { ZONE_KEY, ZONE_ORDER, type ZoneName } from '@/lib/health'
import { Card, cn, Icon, type IconProps, Text } from '@/ui'
import { clock, count } from './format'
import { workoutIcon, workoutKindKey } from './workoutKind'
import { type WorkoutTone, workoutDetails } from './workoutMetrics'

const TONES: Record<WorkoutTone, { fill: string; line: string; ink: string }> = {
  pandan: { fill: 'bg-pandan-soft', line: 'border-pandan-soft-line', ink: 'text-pandan-ink' },
  kaya: { fill: 'bg-kaya-soft', line: 'border-kaya-soft-line', ink: 'text-kaya-ink' },
  water: { fill: 'bg-water-soft', line: 'border-water-soft-line', ink: 'text-water-ink' },
  hibiscus: {
    fill: 'bg-hibiscus-soft',
    line: 'border-hibiscus-soft-line',
    ink: 'text-hibiscus-ink',
  },
  teh: { fill: 'bg-teh-soft', line: 'border-teh-soft-line', ink: 'text-teh-ink' },
}

const ZONE_FILL: Record<ZoneName, string> = {
  easy: 'bg-water',
  steady: 'bg-pandan',
  hard: 'bg-kaya',
  peak: 'bg-hibiscus',
}

/**
 * One sport, led by the measurement that describes it. The store only keeps
 * zone durations, so the bars show time in each band, never an invented pulse
 * trace, route, lap or personal record.
 */
export function WorkoutDetails({ session }: { session: ActivitySession }) {
  const { t } = useTranslation(['activity', 'common'])
  const { fontScale } = useWindowDimensions()
  const wideText = fontScale > 1.3
  const details = workoutDetails(session)
  const tone = TONES[details.tone]
  const name = session.kindLabel?.trim() || t(workoutKindKey(session.kind))
  const zones = session.hrZones
  const zoneTotal = zones ? ZONE_ORDER.reduce((sum, zone) => sum + zones[zone], 0) : 0
  const hasHeart = session.avgHr != null || session.maxHr != null || zoneTotal > 0

  return (
    <>
      <View className={cn('overflow-hidden rounded-card border p-5', tone.fill, tone.line)}>
        <Text variant="title">{name}</Text>
        <Text variant="meta" className="mt-0.5">
          {format(parseISO(session.startedAt), datePattern('dayMonthYear'))}
          {' · '}
          {format(parseISO(session.startedAt), datePattern('time'))}
        </Text>

        <View className="mt-2 min-h-[112px] flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <Text variant="overlineSm" className={tone.ink}>
              {t(details.distance ? 'activity:workout.distance' : 'activity:workout.time')}
            </Text>
            <Text
              variant="displayLg"
              className={cn('text-[44px]', tone.ink)}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
            >
              {details.distance?.value ?? clock(session.durationS)}
            </Text>
            {details.distance ? (
              <Text variant="label" className={tone.ink}>
                {t(
                  details.distance.unit === 'm'
                    ? 'activity:workout.metresUnit'
                    : 'activity:workout.kilometresUnit',
                )}
              </Text>
            ) : null}
          </View>

          {!wideText ? (
            <View
              className="h-[112px] w-[112px] items-center justify-center"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View className={cn('absolute h-[110px] w-[110px] rounded-full border', tone.line)} />
              <View className={cn('absolute h-[90px] w-[90px] rounded-full border', tone.line)} />
              <Icon {...workoutIcon(session.kind)} size={96} />
            </View>
          ) : null}
        </View>

        <View className={cn('mt-3 border-t pt-3', wideText ? 'gap-3' : 'flex-row', tone.line)}>
          <Metric
            label={t(details.distance ? 'activity:workout.time' : 'activity:workout.energy')}
            value={details.distance ? clock(session.durationS) : count(session.activeKcal)}
            unit={details.distance ? undefined : t('common:unit.kcal')}
            icon={{ set: 'body', name: details.distance ? 'stopwatch' : 'flame-burn' }}
            className={wideText ? undefined : 'flex-1'}
          />
          {details.distance ? (
            <Metric
              label={t('activity:workout.energy')}
              value={count(session.activeKcal)}
              unit={t('common:unit.kcal')}
              icon={{ set: 'body', name: 'flame-burn' }}
              className={cn(wideText ? 'border-t pt-3' : 'ml-4 flex-1 border-l pl-4', tone.line)}
            />
          ) : null}
        </View>
      </View>

      {details.rhythm || session.elevationM != null ? (
        <Card contentClassName={cn('py-4', wideText ? 'gap-3' : 'flex-row gap-0')}>
          {details.rhythm ? (
            <Metric
              label={t(
                details.rhythm.unit === 'speedUnit'
                  ? 'activity:workout.speed'
                  : 'activity:workout.pace',
              )}
              value={t(`activity:workout.${details.rhythm.unit}`, { value: details.rhythm.value })}
              icon={{ set: 'body', name: details.kind === 'cycle' ? 'cycling' : 'stopwatch' }}
              className={wideText ? undefined : 'flex-1'}
            />
          ) : null}
          {session.elevationM != null ? (
            <Metric
              label={t('activity:workout.elevation')}
              value={t('activity:workout.metres', { value: count(session.elevationM) })}
              icon={{ set: 'body', name: 'mountain' }}
              className={cn(
                !wideText && 'flex-1',
                details.rhythm &&
                  (wideText ? 'border-line border-t pt-3' : 'ml-4 border-line border-l pl-4'),
              )}
            />
          ) : null}
        </Card>
      ) : null}

      {hasHeart ? (
        <Card contentClassName="gap-4">
          <View className="flex-row items-center gap-2">
            <Icon set="body" name="heart-rate" size={24} />
            <Text variant="subtitle" className="flex-1">
              {t('activity:workout.heartRate')}
            </Text>
          </View>
          {session.avgHr != null || session.maxHr != null ? (
            <View className={wideText ? 'gap-3' : 'flex-row'}>
              {session.avgHr != null ? (
                <HeartMetric
                  label={t('activity:workout.avgHr')}
                  value={session.avgHr}
                  className={!wideText ? 'flex-1' : undefined}
                />
              ) : null}
              {session.maxHr != null ? (
                <HeartMetric
                  label={t('activity:workout.maxHr')}
                  value={session.maxHr}
                  className={cn(
                    !wideText && 'flex-1',
                    session.avgHr != null
                      ? wideText
                        ? 'border-line border-t pt-3'
                        : 'ml-4 border-line border-l pl-4'
                      : undefined,
                  )}
                />
              ) : null}
            </View>
          ) : null}

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
                    className={
                      wideText ? 'flex-row items-center justify-between gap-3' : 'w-[72px]'
                    }
                  >
                    <Text variant="caption" className="shrink text-body">
                      {t(ZONE_KEY[zone])}
                    </Text>
                    {wideText ? <Text variant="label">{clock(zones[zone])}</Text> : null}
                  </View>
                  <View
                    className={cn(
                      'h-2.5 overflow-hidden rounded-full bg-track',
                      !wideText && 'flex-1',
                    )}
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
      ) : null}
    </>
  )
}

function Metric({
  label,
  value,
  unit,
  icon,
  className,
}: {
  label: string
  value: string
  unit?: string
  icon: IconProps
  className?: string
}) {
  return (
    <View
      className={cn('min-w-0 gap-1', className)}
      accessible
      accessibilityLabel={`${label}, ${value} ${unit ?? ''}`}
    >
      <View className="flex-row items-center gap-1.5">
        <Icon {...icon} size={18} />
        <Text variant="overlineSm" className="shrink text-muted">
          {label}
        </Text>
      </View>
      <Text
        variant="displayMd"
        className="text-[25px]"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
        {unit ? <Text variant="caption"> {unit}</Text> : null}
      </Text>
    </View>
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
      className={cn('min-w-0', className)}
      accessible
      accessibilityLabel={`${label}, ${t('workout.bpm', { value })}`}
    >
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
      <Text variant="overlineSm" className="text-muted">
        {label}
      </Text>
    </View>
  )
}
