import { useState } from 'react'

import { dateKey } from '@/data/client'
import { WhenWheels } from '@/features/logging/DetailsSheet'
import { type Clock, clockOf, instantOn } from '@/features/logging/when'
import { WheelSheet } from './WheelSheet'

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
  const [date, setDate] = useState(() => dateKey(new Date(value)))
  const [clock, setClock] = useState<Clock>(() => clockOf(new Date(value).toISOString()))

  return (
    <WheelSheet
      visible={visible}
      title={title}
      onOpen={() => {
        setDate(dateKey(new Date(value)))
        setClock(clockOf(new Date(value).toISOString()))
      }}
      onClose={onClose}
      onDone={() => onPick(Math.min(Date.parse(instantOn(date, clock)), Date.now()))}
    >
      <WhenWheels
        anchor={dateKey(new Date(value))}
        date={date}
        clock={clock}
        today={dateKey(new Date())}
        onDate={setDate}
        onClock={setClock}
      />
    </WheelSheet>
  )
}
