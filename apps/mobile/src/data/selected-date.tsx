import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState } from 'react-native'

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
  /**
   * The real today. Fixed while the app is in the foreground, so a session that
   * crosses midnight keeps its footing, and re-read whenever the app comes back
   * to it. See the effect below for why the second half is not optional.
   */
  todayKey: string
}

const SelectedDateContext = createContext<SelectedDateValue | null>(null)

export function SelectedDateProvider({ children }: { children: ReactNode }) {
  const [todayKey, setTodayKey] = useState(today)
  const [selectedDate, setSelectedDate] = useState(todayKey)

  /**
   * What the listener below would otherwise close over.
   *
   * It subscribes once, so reading the state directly would read the values
   * they had at mount — which are precisely the stale ones it exists to
   * correct. Assigned in an effect rather than during render: an AppState
   * change cannot interleave with a synchronous render, so this is always the
   * committed value by the time anything reads it.
   */
  const latest = useRef({ todayKey, selectedDate })
  useEffect(() => {
    latest.current = { todayKey, selectedDate }
  })

  /**
   * Re-read the date when the app comes back, because a phone does not close apps
   * and this key was frozen for the life of the process.
   *
   * Fixing it at mount is right for an app open across midnight, which should not
   * renumber itself under somebody's thumb. It did not survive the ordinary case:
   * iOS suspends rather than kills, so a diary opened on Saturday and reopened on
   * Monday still believed it was Saturday. The heading said "Today" over
   * Saturday, `WeekPicker` built its pages from the stale key so Monday had no
   * cell at all, and the log button wrote Monday's breakfast into Saturday.
   *
   * Only on the transition into `active`, which keeps the midnight case intact.
   *
   * The selection follows only when it was parked on today: a day somebody picked
   * on purpose is still the day they picked.
   */
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return

      const now = today()
      const { todayKey: was, selectedDate: showing } = latest.current
      if (now === was) return

      setTodayKey(now)
      if (showing === was) setSelectedDate(now)
    })

    return () => listener.remove()
  }, [])

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
