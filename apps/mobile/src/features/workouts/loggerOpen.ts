import type { useRouter } from 'expo-router'
import { useEffect } from 'react'

/**
 * How many loggers are mounted: anywhere in the stack, not only on top. A tap
 * on a workout's notice goes back to one that is open (under the library, say)
 * rather than pushing a second, and "still training?" only interrupts from the
 * banner when no logger is there to ask it.
 *
 * A module of its own, importing nothing, so the notification routing can read
 * it without loading the workouts data layer.
 */
let loggersOpen = 0
export const loggerIsOpen = () => loggersOpen > 0

/** When `openLogger` last opened it. */
let openedAt = 0
/**
 * Long enough to cover the logger sliding in. A second tap on Start in that
 * time found the workout the first had started and asked to replace it, or
 * hit the button that had become Resume and pushed a second logger.
 */
const SETTLING_MS = 800

/** Whether the logger was opened a moment ago, so a tap now is the same tap again. */
export const loggerJustOpened = () => Date.now() - openedAt < SETTLING_MS

/**
 * Show the logger: back to the one already in the stack, or a new one. Two
 * loggers also shared a keep-awake tag, and the first to close let the phone
 * sleep under the other.
 */
export function openLogger(router: Pick<ReturnType<typeof useRouter>, 'push' | 'dismissTo'>): void {
  if (loggerJustOpened()) return
  openedAt = Date.now()
  if (loggerIsOpen()) router.dismissTo('/workout/active')
  else router.push('/workout/active')
}

export function useLoggerOpen(): void {
  useEffect(() => {
    loggersOpen += 1
    return () => {
      loggersOpen -= 1
    }
  }, [])
}
