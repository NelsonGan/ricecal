import { useEffect, useState } from 'react'

/**
 * The value, but only after it has stopped changing for `delay` ms.
 *
 * Not the same job as `useDeferredValue`, which is what search used before.
 * That one keeps the *input* responsive by letting React render the list at a
 * lower priority — but it still renders it for every keystroke, and a query
 * hook downstream still fires a request for every keystroke. Against a
 * 457,000-row catalogue that is one `search_foods` round trip per character,
 * and the results visibly thrash as the shorter prefixes resolve out of order.
 *
 * Debouncing moves the decision earlier: no query exists until the typing
 * pauses, so there is nothing to race.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
