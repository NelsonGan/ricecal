import { format } from 'date-fns'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useCurrentWeight, useLogWeight, useProfile, useWeighIns } from '@/data'
import { BarChart, StatRow } from '@/features/shared'
import { bmi, goalDate, progressOf, weeklyPace } from '@/lib/nutrition'
import { Badge, Button, Card, ProgressBar, Sheet, Slider, Text, useToast } from '@/ui'

/** P1 WEIGHT */
export function WeightPanel() {
  const { t } = useTranslation(['progress', 'common'])
  const toast = useToast()
  const { data: profile } = useProfile()
  const { data: weighIns = [] } = useWeighIns()
  const logWeight = useLogWeight()
  const current = useCurrentWeight() ?? 0

  const [logging, setLogging] = useState(false)
  const [draft, setDraft] = useState(0)

  const target = Number(profile?.target_weight_kg ?? 0)
  const goal = profile?.weight_goal ?? 'track'
  const started = weighIns[0]?.kg ?? current
  const change = round1(started - current)
  const reachedOn = goalDate(goal, current, target, new Date())
  const bodyMass = bmi(Number(profile?.height_cm ?? 0), current)

  // Eight weekly averages. Twelve fit on the canvas but not their labels, and
  // a chart whose last column reads "N..." is worse than a shorter chart.
  const bars = weighIns.slice(-8).map((entry, index, all) => ({
    key: entry.date,
    label: index === all.length - 1 ? t('progress:weight.now') : String(index + 1),
    value: entry.kg,
    highlight: index === all.length - 1,
  }))

  const save = () => {
    logWeight.mutate({ kg: round1(draft) })
    setLogging(false)
    toast.show({ title: t('progress:weight.saved'), tone: 'success' })
  }

  return (
    <>
      <Badge tone={change >= 0 ? 'pandan' : 'kaya'} className="self-start">
        <Text
          className={`font-body-black text-[12px] leading-[15px] ${
            change >= 0 ? 'text-pandan-ink' : 'text-kaya-ink'
          }`}
        >
          {change === 0
            ? t('progress:weight.steady')
            : change > 0
              ? t('progress:weight.down', { value: change.toFixed(1) })
              : t('progress:weight.up', { value: Math.abs(change).toFixed(1) })}
        </Text>
      </Badge>

      <Card>
        <View className="flex-row items-end justify-between">
          <View className="gap-0.5">
            <Text variant="overline">{t('progress:weight.current')}</Text>
            <View className="flex-row items-baseline gap-1">
              <Text variant="display">{current.toFixed(1)}</Text>
              <Text variant="meta" className="text-[18px]">
                {t('common:unit.kg')}
              </Text>
            </View>
          </View>
          <View className="items-end gap-0.5">
            <Text variant="overline">{t('progress:weight.goal')}</Text>
            <Text variant="numeric" className="text-muted">
              {target.toFixed(1)} {t('common:unit.kg')}
            </Text>
          </View>
        </View>

        <BarChart
          bars={bars}
          // Weight never goes near zero, so the bars are scaled to their own
          // range. From zero every reading looks the same height.
          scale="range"
          accessibilityLabel={t('progress:weight.chartNote')}
        />

        <ProgressBar
          value={progressOf(Math.abs(started - current), Math.abs(started - target))}
          height={16}
          accessibilityLabel={t('progress:weight.goal')}
        />

        <Text variant="meta">{t('progress:weight.chartNote')}</Text>
      </Card>

      <Card title={t('progress:weight.thisWeek')}>
        <StatRow
          stats={[
            {
              key: 'avg',
              label: t('progress:weight.average'),
              value: `${average(weighIns.slice(-2).map((entry) => entry.kg)).toFixed(1)} ${t('common:unit.kg')}`,
            },
            {
              key: 'pace',
              label: t('progress:weight.pace'),
              value: t('progress:weight.paceValue', { value: weeklyPace(goal).toFixed(1) }),
            },
            {
              key: 'date',
              label: t('progress:weight.goalDate'),
              value: reachedOn ? format(reachedOn, 'd MMM') : '—',
            },
          ]}
        />
      </Card>

      <Card title={t('progress:weight.bmi', { value: bodyMass.toFixed(1) })}>
        <BmiBand value={bodyMass} />
        <Text variant="meta">{t('progress:weight.bmiNote')}</Text>
      </Card>

      <Button
        fullWidth
        onPress={() => {
          // Seeded from the newest reading when the sheet opens, not at mount:
          // the query may not have answered yet on first render.
          setDraft(current || 70)
          setLogging(true)
        }}
      >
        {t('progress:weight.log')}
      </Button>

      <Sheet
        visible={logging}
        onClose={() => setLogging(false)}
        title={t('progress:weight.sheetTitle')}
        description={t('progress:weight.sheetBody')}
        footer={
          <Button fullWidth onPress={save}>
            {t('common:action.save')}
          </Button>
        }
      >
        <Slider
          value={draft}
          onChange={setDraft}
          min={35}
          max={160}
          step={0.1}
          label={t('progress:weight.current')}
          accessibilityLabel={t('progress:weight.sheetTitle')}
          format={(value) => `${value.toFixed(1)} ${t('common:unit.kg')}`}
        />
      </Sheet>
    </>
  )
}

const round1 = (value: number) => Math.round(value * 10) / 10

function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * The BMI band with a marker.
 *
 * Four solid segments rather than a gradient: the bands are categorical, and a
 * smooth ramp would suggest 24.9 and 25.1 differ by a hair rather than by a
 * label. The marker is context, never a score.
 */
function BmiBand({ value }: { value: number }) {
  // 15 to 40 covers every position the marker will ever take.
  const position = Math.min(96, Math.max(0, ((value - 15) / 25) * 100))

  return (
    <View className="h-[23px] justify-center">
      <View className="h-[13px] flex-row overflow-hidden rounded-full">
        <View className="flex-[22] bg-water" />
        <View className="flex-[33] bg-pandan" />
        <View className="flex-[25] bg-kaya" />
        <View className="flex-[20] bg-hibiscus" />
      </View>
      <View
        className="absolute h-[23px] w-[7px] rounded border-2 border-surface bg-inverse"
        style={{ left: `${position}%` }}
      />
    </View>
  )
}
