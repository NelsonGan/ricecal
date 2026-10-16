import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { dateKey } from '@/data/client'
import { WhenWheels } from '@/features/logging/DetailsSheet'
import { type Clock, clockOf, instantOn } from '@/features/logging/when'
import { Button, Sheet } from '@/ui'

/**
 * A day and a time on wheels: when a workout started or finished. The diary's
 * "when was this eaten" wheels, because it is the same question.
 *
 * Nothing later than now: a workout that has not ended yet is still running.
 */
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
  const { t } = useTranslation('common')
  const [date, setDate] = useState(() => dateKey(new Date(value)))
  const [clock, setClock] = useState<Clock>(() => clockOf(new Date(value).toISOString()))

  useEffect(() => {
    if (!visible) return
    setDate(dateKey(new Date(value)))
    setClock(clockOf(new Date(value).toISOString()))
  }, [visible, value])

  return (
    // Not scrollable: wheels inside a scroller lose every drag.
    <Sheet
      placement="center"
      visible={visible}
      onClose={onClose}
      closeLabel={t('action.close')}
      title={title}
      scrollable={false}
    >
      <View className="gap-5">
        <WhenWheels
          anchor={dateKey(new Date(value))}
          date={date}
          clock={clock}
          today={dateKey(new Date())}
          onDate={setDate}
          onClock={setClock}
        />
        <Button
          fullWidth
          onPress={() => {
            onPick(Math.min(Date.parse(instantOn(date, clock)), Date.now()))
            onClose()
          }}
        >
          {t('action.done')}
        </Button>
      </View>
    </Sheet>
  )
}
