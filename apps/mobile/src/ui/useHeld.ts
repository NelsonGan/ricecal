import { useRef } from 'react'

/**
 * `value` while `keep` is true, and the last such value after it turns false:
 * what a sheet or dialog showed, kept while it animates away from a caller that
 * clears it as it closes.
 */
export function useHeld<T>(value: T, keep: boolean): T {
  const held = useRef(value)
  if (keep) held.current = value
  return held.current
}
