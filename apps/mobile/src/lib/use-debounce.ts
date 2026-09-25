import { useEffect, useState } from 'react'

/**
 * The value, but only after it has stopped changing for `delay` ms.
 *
 * Not `useDeferredValue`, which search used before: that keeps the input
 * responsive by rendering the list at a lower priority, and still renders it for
 * every keystroke, so a query hook downstream still fires a request per
 * character and the results thrash as the shorter prefixes resolve out of order.
 *
 * Debouncing moves the decision earlier: no query exists until the typing pauses.
 *
 * The default 140ms collapses a typing burst into one request. Screens can use
 * a longer delay when a remote search needs more time between requests.
 */
export function useDebouncedValue<T>(value: T, delay = 140): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
