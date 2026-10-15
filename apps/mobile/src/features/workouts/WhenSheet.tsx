import { parseISO, subDays } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { dateKey, datesBetween } from '@/data/client'
import { type Clock, clockOf, dayLabel, instantOn } from '@/features/logging/when'
import { Button, cn, Sheet, Tappable, Text, Wheel, type WheelOption } from '@/ui'

/**
 * A day and a time on wheels: when a workout started or finished. The same
 * four columns the diary's "when was this eaten" uses (see `DetailsSheet`),
 * because they are the same question.
 *
 * Nothing later than now: a workout that has not ended yet is still running.
 */

const PERIODS = ['am', 'pm'] as const
const DAYS_BACK = 60

export function WhenSheet({
  visible,
  title,
  value,
  onClose,
  onPick,
}: {
  visible: boolean
  title: string
  /** Epoch milliseconds. */
  value: number
  onClose: () => void
  onPick: (at: number) => void
}) {
  const { t } = useTranslation(['logging', 'common'])
  const [date, setDate] = useState(() => dateKey(new Date(value)))
  const [clock, setClock] = useState<Clock>(() => clockOf(new Date(value).toISOString()))

  useEffect(() => {
    if (!visible) return
    setDate(dateKey(new Date(value)))
    setClock(clockOf(new Date(value).toISOString()))
  }, [visible, value])

  const today = dateKey(new Date())
  const anchor = dateKey(new Date(value))
  const days = useMemo<WheelOption[]>(() => {
    const labels = { today: t('common:date.today'), yesterday: t('common:date.yesterday') }
    const from = dateKey(subDays(parseISO(today), DAYS_BACK))
    return datesBetween(from > anchor ? anchor : from, today).map((day) => ({
      value: day,
      label: dayLabel(day, today, labels),
    }))
  }, [today, anchor, t])
  const hours = useMemo<WheelOption[]>(
    () => Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
    [],
  )
  const minutes = useMemo<WheelOption[]>(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        value: String(i),
        label: String(i).padStart(2, '0'),
      })),
    [],
  )

  return (
    // Not scrollable: wheels inside a scroller lose every drag.
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={title}
      scrollable={false}
    >
      <View className="gap-5">
        <View className="flex-row gap-1.5">
          <Wheel
            className="flex-[3]"
            options={days}
            value={date}
            onChange={setDate}
            accessibilityLabel={t('logging:detail.dayTitle')}
          />
          <Wheel
            className="flex-1"
            options={hours}
            value={String(clock.hour)}
            onChange={(next) => setClock({ ...clock, hour: Number(next) })}
            accessibilityLabel={t('logging:detail.hour')}
          />
          <Wheel
            className="flex-1"
            options={minutes}
            value={String(clock.minute)}
            onChange={(next) => setClock({ ...clock, minute: Number(next) })}
            accessibilityLabel={t('logging:detail.minute')}
          />
          <View className="w-[62px] justify-center gap-1.5">
            {PERIODS.map((option) => {
              const chosen = clock.period === option
              return (
                <Tappable
                  key={option}
                  className={cn(
                    'items-center rounded-md py-2.5',
                    chosen ? 'bg-pandan' : 'bg-track',
                  )}
                  onPress={() => setClock({ ...clock, period: option })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: chosen }}
                  accessibilityLabel={t(`logging:detail.${option}`)}
                >
                  <Text
                    className={cn(
                      'font-display text-[17px]',
                      chosen ? 'text-on-pandan' : 'text-muted',
                    )}
                  >
                    {t(`logging:detail.${option}`)}
                  </Text>
                </Tappable>
              )
            })}
          </View>
        </View>
        <Button
          fullWidth
          onPress={() => {
            const at = Math.min(Date.parse(instantOn(date, clock)), Date.now())
            onPick(at)
            onClose()
          }}
        >
          {t('common:action.done')}
        </Button>
      </View>
    </Sheet>
  )
}
