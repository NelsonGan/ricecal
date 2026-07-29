import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

import { today } from './client'

/**
 * Which day Today and the diary are showing.
 *
 * The one piece of state that is genuinely the client's: it is not on any
 * server, it is not shared between devices, and it resets every launch. Server
 * state goes through react-query; this does not, because there is nothing to
 * fetch and nothing to invalidate.
 */

type SelectedDateValue = {
  selectedDate: string
  setSelectedDate: (date: string) => void
  /** The real today, fixed at mount — a session that crosses midnight keeps its footing. */
  todayKey: string
}

const SelectedDateContext = createContext<SelectedDateValue | null>(null)

export function SelectedDateProvider({ children }: { children: ReactNode }) {
  const [todayKey] = useState(today)
  const [selectedDate, setSelectedDate] = useState(todayKey)

  const value = useMemo(
    () => ({ selectedDate, setSelectedDate, todayKey }),
    [selectedDate, todayKey],
  )

  return <SelectedDateContext.Provider value={value}>{children}</SelectedDateContext.Provider>
}

export function useSelectedDate(): SelectedDateValue {
  const context = useContext(SelectedDateContext)
  if (!context) throw new Error('useSelectedDate must be used inside <SelectedDateProvider>')
  return context
}
