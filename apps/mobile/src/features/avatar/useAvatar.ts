import { useMemo } from 'react'

import { useEntitlement, useProfile, useSettings, useUpdateSettings } from '@/data'
import { type AvatarBase, freeOutfit, type Outfit, parseOutfit, serialiseOutfit } from './wardrobe'

/**
 * The outfit to draw, and the one saved.
 *
 * They differ only for an account known to be without Pro, which draws the
 * default outfit on its chosen base while the saved outfit waits, untouched,
 * for the day the subscription comes back. Somebody who has never saved one
 * gets the base that matches their profile.
 */
export function useAvatar() {
  const { data: settings, isPending } = useSettings()
  const { data: profile, isPending: profilePending } = useProfile()
  const { entitled, loading, unknown } = useEntitlement()
  // Only a definite no draws the plain outfit. A cold start or an offline
  // launch has not answered yet, and a Pro figure undressing until it does
  // would be the app forgetting what somebody paid for.
  const free = !entitled && !loading && !unknown
  const fallbackBase: AvatarBase = profile?.sex === 'female' ? 'girl' : 'guy'
  const stored = settings?.avatar
  // The same objects until something in them changes: the figure keys its
  // drawing and its animation on the outfit.
  const storedKey = JSON.stringify(stored ?? null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `storedKey` stands for `stored`
  const saved = useMemo(() => parseOutfit(stored, fallbackBase), [storedKey, fallbackBase])
  const outfit = useMemo(() => (free ? freeOutfit(saved) : saved), [free, saved])
  return {
    outfit,
    saved,
    free,
    // Until both have answered, `saved` is a guess (the defaults, on a base
    // read from a profile that is not there yet), and must not be saved over
    // the real one.
    loading: isPending || profilePending,
  }
}

/** Saves the outfit to the account, so every phone signed in draws the same one. */
export function useSaveAvatar() {
  const update = useUpdateSettings()
  return {
    save: (outfit: Outfit) => update.mutateAsync({ avatar: serialiseOutfit(outfit) }),
    saving: update.isPending,
  }
}
