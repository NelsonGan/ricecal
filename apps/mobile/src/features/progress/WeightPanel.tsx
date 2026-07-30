import { format, isToday, parseISO } from 'date-fns'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  bodyFrom,
  today,
  useCurrentWeight,
  useDeleteWeighIn,
  useLogWeight,
  useProfile,
  useWeighIns,
} from '@/data'
import { BarChart, StatRow } from '@/features/shared'
import { bmi, goalDate, progressOf, weeklyPace } from '@/lib/nutrition'
import {
  Button,
  Card,
  ConfirmSheet,
  ListRow,
  ProgressBar,
  Sheet,
  Slider,
  Text,
  useToast,
} from '@/ui'

/** P1 WEIGHT */
export function WeightPanel() {
  const { t } = useTranslation(['progress', 'common'])
  const toast = useToast()
  const { data: profile } = useProfile()
  const { data: weighIns = [] } = useWeighIns()
  const logWeight = useLogWeight()
  const deleteWeighIn = useDeleteWeighIn()
  const current = useCurrentWeight() ?? 0

  /**
   * Which day the sheet is editing, and null when it is shut.
   *
   * A date rather than a boolean, because the same sheet now records today's
   * reading and corrects a past one — `useLogWeight` upserts on
   * `(user_id, measured_on)`, so which day it writes to is the only difference
   * between the two.
   */
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const target = Number(profile?.target_weight_kg ?? 0)
  // The first reading, which is what the progress bar measures from.
  const started = weighIns[0]?.kg ?? current
  /**
   * The pace and the date both come from this, so they describe the same plan as
   * the budget on Today. Null while the profile is incomplete — there is no
   * honest pace to quote from a body we do not know.
   */
  const body = bodyFrom(profile, current || undefined)
  const reachedOn = body ? goalDate(body, target, new Date()) : null
  const bodyMass = bmi(Number(profile?.height_cm ?? 0), current)

  // Eight readings. Twelve fit on the canvas but not their labels, and a chart
  // whose last column reads "N..." is worse than a shorter chart. Dated, because
  // "1, 2, 3 … Now" told the reader the order of the readings and nothing about
  // when any of them was taken — two months of nothing looked like a steady week.
  const bars = weighIns.slice(-8).map((entry, index, all) => ({
    key: entry.date,
    label:
      index === all.length - 1 ? t('progress:weight.now') : format(parseISO(entry.date), 'd/M'),
    value: entry.kg,
    highlight: index === all.length - 1,
  }))

  /**
   * The readings as a list, newest first, each against the one before it.
   *
   * The chart shows the shape and the list shows the numbers — including the days
   * with no reading, by simply not being there, which a chart of evenly spaced
   * bars cannot say. Ten rows: enough to cover a month of weekly weigh-ins.
   */
  const history = weighIns
    .map((entry, index) => ({
      ...entry,
      change: index > 0 ? round1(entry.kg - weighIns[index - 1].kg) : undefined,
    }))
    .slice(-10)
    .reverse()

  const openSheet = (date: string, kg: number) => {
    // Seeded when the sheet opens, not at mount: the query may not have answered
    // yet on first render.
    setDraft(kg || 70)
    setEditing(date)
  }

  const save = () => {
    if (!editing) return
    logWeight.mutate({ kg: round1(draft), date: editing })
    setEditing(null)
    toast.show({ title: t('progress:weight.saved'), tone: 'success' })
  }

  const remove = () => {
    if (editing) deleteWeighIn.mutate({ date: editing })
    setConfirmDelete(false)
    setEditing(null)
  }

  return (
    <>
      {/* No badge over the card. It read "Holding steady" for anybody with one
          reading — which is everybody on their first day — by comparing the oldest
          weigh-in with the newest and finding the same row twice. The history list
          below states the same thing per reading and cannot be wrong about it. */}
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
              value: body
                ? t('progress:weight.paceValue', { value: Math.abs(weeklyPace(body)).toFixed(2) })
                : '—',
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

      {history.length ? (
        <Card title={t('progress:weight.history')} contentClassName="gap-0">
          {history.map((entry, index) => (
            <ListRow
              key={entry.date}
              title={t('progress:weight.reading', { value: entry.kg.toFixed(1) })}
              subtitle={
                isToday(parseISO(entry.date))
                  ? t('progress:weight.readingToday')
                  : format(parseISO(entry.date), 'EEEE d MMMM')
              }
              // Every row leads to the same sheet, on its own day — which is the
              // only way to correct a reading typed at the wrong scale.
              onPress={() => openSheet(entry.date, entry.kg)}
              divider={index < history.length - 1}
              trailing={
                <Text
                  variant="label"
                  className={
                    entry.change === undefined
                      ? 'text-faint'
                      : entry.change > 0
                        ? 'text-kaya-ink'
                        : 'text-pandan-ink'
                  }
                >
                  {entry.change === undefined
                    ? t('progress:weight.firstReading')
                    : t('progress:weight.changeValue', {
                        value: `${entry.change > 0 ? '+' : ''}${entry.change.toFixed(1)}`,
                      })}
                </Text>
              }
            />
          ))}
        </Card>
      ) : null}

      <Button fullWidth onPress={() => openSheet(today(), current)}>
        {t('progress:weight.log')}
      </Button>

      {/* Stood down while the confirmation is up rather than left underneath it.
          `Sheet` is a native `Modal`, so two of them visible at once is two
          windows — the order they present in is the platform's business, not
          this file's, and the one being answered has to be on top. `editing` is
          untouched, so cancelling brings this straight back. */}
      <Sheet
        visible={editing !== null && !confirmDelete}
        onClose={() => setEditing(null)}
        title={
          editing && !isToday(parseISO(editing))
            ? t('progress:weight.editTitle', { date: format(parseISO(editing), 'd MMMM') })
            : t('progress:weight.sheetTitle')
        }
        description={t('progress:weight.sheetBody')}
        footer={
          <View className="gap-2">
            <Button fullWidth onPress={save}>
              {t('common:action.save')}
            </Button>
            {/* Only for a day that already has a reading. There is nothing to
                remove from the day the button at the bottom of the panel opens. */}
            {editing && weighIns.some((entry) => entry.date === editing) ? (
              <Button
                variant="ghost"
                fullWidth
                labelClassName="text-hibiscus-ink"
                onPress={() => setConfirmDelete(true)}
              >
                {t('progress:weight.remove')}
              </Button>
            ) : null}
          </View>
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

      <ConfirmSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={t('progress:weight.removeTitle')}
        description={t('progress:weight.removeBody')}
        confirmLabel={t('common:action.delete')}
        tone="danger"
      />
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
