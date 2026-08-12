import { useEffect, useState } from 'react'

/**
 * The value, but only after it has stopped changing for `delay` ms.
 *
 * Not the same job as `useDeferredValue`, which is what search used before.
 * That one keeps the *input* responsive by letting React render the list at a
 * lower priority — but it still renders it for every keystroke, and a query
 * hook downstream still fires a request for every keystroke. That is one round
 * trip to the catalogue Worker per character, and the results visibly thrash as
 * the shorter prefixes resolve out of order.
 *
 * Debouncing moves the decision earlier: no query exists until the typing
 * pauses, so there is nothing to race.
 *
 * 140ms is under the gap between two keystrokes of ordinary typing, so a burst
 * still collapses into one request, and it is short enough that a pause between
 * words does not read as the list having stopped working. 300 was safe and felt
 * like waiting.
 */
export function useDebouncedValue<T>(value: T, delay = 140): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
