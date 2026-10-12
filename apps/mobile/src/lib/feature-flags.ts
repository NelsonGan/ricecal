import { useSyncExternalStore } from 'react'

/**
 * PostHog feature flags, for rolling a feature out to part of the audience or
 * testing two versions of it.
 *
 * A seam like `lib/analytics`: no native import, so a component can read a flag
 * in a test. `startup.ts` registers PostHog as the source; until then, in
 * development, and in any build that does not send, every flag reads as
 * `undefined`, which callers must treat as off.
 *
 * To add one: create it in PostHog (project RiceCal), add its key below with a
 * comment saying what it gates and when it can be deleted, and read it with
 * `useFeatureFlag`. A flag read sends `$feature_flag_called` once per flag per
 * session, which is what an experiment needs for exposure; add that to the
 * event budget in the README when a flag ships, and archive the flag once its
 * rollout is complete.
 */
export const FEATURE_FLAGS = {} as const satisfies Record<string, string>

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS]

export type FeatureFlagSource = {
  getFeatureFlag(key: string): boolean | string | undefined
  getFeatureFlagPayload(key: string): unknown
  /** Called whenever flags load or reload; returns an unsubscribe. */
  onFeatureFlags(listener: () => void): () => void
}

let source: FeatureFlagSource | null = null
const listeners = new Set<() => void>()
let unsubscribeSource: (() => void) | null = null

function notify() {
  for (const listener of listeners) listener()
}

export function registerFeatureFlags(next: FeatureFlagSource | null): void {
  unsubscribeSource?.()
  source = next
  unsubscribeSource = next ? next.onFeatureFlags(notify) : null
  notify()
}

/** `true`/`false` for a boolean flag, the variant key for a multivariate one. */
export function getFeatureFlag(key: FeatureFlagKey): boolean | string | undefined {
  try {
    return source?.getFeatureFlag(key)
  } catch {
    return undefined
  }
}

export function getFeatureFlagPayload(key: FeatureFlagKey): unknown {
  try {
    return source?.getFeatureFlagPayload(key)
  } catch {
    return undefined
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Re-renders when flags load or change. `undefined` means not loaded: treat as off. */
export function useFeatureFlag(key: FeatureFlagKey): boolean | string | undefined {
  return useSyncExternalStore(subscribe, () => getFeatureFlag(key))
}
