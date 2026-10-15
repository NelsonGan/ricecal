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

export function useLoggerOpen(): void {
  useEffect(() => {
    loggersOpen += 1
    return () => {
      loggersOpen -= 1
    }
  }, [])
}
