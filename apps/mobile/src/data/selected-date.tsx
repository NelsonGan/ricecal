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
   * RE-READ THE DATE WHEN THE APP COMES BACK, because a phone does not close
   * apps and this key was frozen for the whole life of the process.
   *
   * Fixing it at mount is right for the case it was written for: an app that is
   * OPEN across midnight should not renumber itself under somebody's thumb.
   * What it did not survive is the ordinary one. iOS suspends rather than kills,
   * so a diary opened on Saturday and reopened on Monday still believed it was
   * Saturday, and every consequence of that was silent:
   *
   * - The heading said "Today" over Saturday, under a ring captioned "from
   *   moving today".
   * - `WeekPicker` builds its pages from this key, so the last page was the week
   *   that ended on Saturday and Monday HAD NO CELL AT ALL. The real today was
   *   unreachable, and the day either side of the boundary read as "ahead of
   *   today" and drew no dot.
   * - Worst of it: `selectedDate` starts life as this key, so the log button
   *   wrote Monday's breakfast into Saturday's diary.
   *
   * Only on the transition INTO `active`, which is what keeps the midnight case
   * intact: an app nobody has left never fires this, so a session running across
   * 00:00 goes on describing the day it started in.
   *
   * The selection follows only when it was parked ON today. A day somebody
   * picked on purpose is still the day they picked, and moving it would throw
   * away the thing they came back to look at.
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
