import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createMMKV } from 'react-native-mmkv'

import type { ActivityLevel, Sex } from '@/data'

/**
 * The onboarding answers, before there is an account to put them in.
 *
 * This exists because the questions come first now. A user answers four screens
 * and sees the budget they produce, and only THEN is asked for an email — which
 * means every answer has to live somewhere that is not `profiles`, since the
 * profile row does not exist yet and the hooks that write it throw without a
 * session rather than failing quietly.
 *
 * On disk rather than in memory, through MMKV, for two reasons. Onboarding is the
 * longest uninterrupted stretch of typing in the app and the most likely place to
 * be interrupted by something else on the phone, so answers surviving a restart
 * is the difference between resuming and starting again. And the router reads
 * `isComplete` to decide where a returning visitor belongs, which it cannot do
 * from state that died with the process.
 *
 * Reads are synchronous, so there is no loading state to thread through the
 * questions — the first render already has the answers.
 */

const storage = createMMKV({ id: 'ricecal-onboarding' })
const KEY = 'draft'

export type OnboardingDraft = {
  sex?: Sex
  /** Kept as an age, converted to a birth date only on the way to the database. */
  age?: number
  heightCm?: number
  /** Becomes the first weigh-in, not a profile column. */
  weightKg?: number
  targetWeightKg?: number
  activity?: ActivityLevel
  foodStyles?: string[]
  referralSource?: string
}

/**
 * A draft with every answer in it, which is what the flush needs.
 *
 * There used to be an `exit` field here — which screen to land on once the
 * account existed — recorded on the target screen and read back after the
 * flush. The flow no longer ends there: the tour after the permissions is the
 * last screen, it is on the far side of the write, and it can simply navigate.
 * A remembered decision that outlives the screen that made it is only worth
 * carrying when something in between has to be crossed.
 */
export type CompleteDraft = Required<OnboardingDraft>

/**
 * Whether there is enough here to build a profile and a budget.
 *
 * Every field the database's `compute_targets()` reads is required, which is most
 * of them: a partial flush leaves a signed-in user with no budget and no screen
 * offering to fix it.
 *
 * A type guard rather than a boolean, so the one place that reads every field
 * does not need a cast apiece to say what this check has already established.
 */
export function isComplete(draft: OnboardingDraft): draft is CompleteDraft {
  return Boolean(
    draft.sex &&
      draft.age &&
      draft.heightCm &&
      draft.weightKg &&
      draft.targetWeightKg &&
      draft.activity &&
      draft.foodStyles?.length &&
      draft.referralSource,
  )
}

function read(): OnboardingDraft {
  const raw = storage.getString(KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as OnboardingDraft
  } catch {
    // A draft written by an older shape is worth less than a working app.
    return {}
  }
}

type DraftValue = {
  draft: OnboardingDraft
  /** Merges answers in. Absent keys are left alone, so each screen writes its own. */
  patch: (next: OnboardingDraft) => void
  /** After a successful flush. Nothing here should outlive the account it made. */
  clear: () => void
}

const DraftContext = createContext<DraftValue | null>(null)

export type OnboardingDraftProviderProps = {
  children: ReactNode
  /**
   * Who is signed in, passed in rather than read from the session here.
   *
   * This module stays clear of the data layer on purpose: importing it pulls in
   * the Supabase client, which builds itself at import time and cannot be
   * constructed in a test environment at all. A single `string | null` is the
   * whole of what this needs, and the app layout is already inside the session
   * provider.
   */
  userId: string | null
}

export function OnboardingDraftProvider({ children, userId }: OnboardingDraftProviderProps) {
  const [draft, setDraft] = useState<OnboardingDraft>(read)

  const patch = useCallback((next: OnboardingDraft) => {
    setDraft((current) => {
      const merged = { ...current, ...next }
      storage.set(KEY, JSON.stringify(merged))
      return merged
    })
  }, [])

  const clear = useCallback(() => {
    storage.remove(KEY)
    setDraft({})
  }, [])

  /**
   * Signing out empties the draft.
   *
   * Two things go wrong without it, and the second is the serious one. A draft
   * outlives the account it was flushed for, so a relaunch after signing out
   * found a complete set of answers and treated the user as mid-onboarding. And
   * worse: the next person to sign in on this phone who had not finished
   * onboarding would have had THOSE answers flushed onto their profile — someone
   * else's height, weight and target, silently.
   *
   * On the transition only. A launch with no session has never had one, and there
   * is nothing to clear; a first render must not wipe answers being collected
   * before the account exists, which is the entire point of the draft.
   */
  const lastUserId = useRef(userId)
  useEffect(() => {
    if (lastUserId.current && !userId) clear()
    lastUserId.current = userId
  }, [userId, clear])

  const value = useMemo(() => ({ draft, patch, clear }), [draft, patch, clear])

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
}

/**
 * Throws rather than falling back to an empty draft. A screen rendered outside
 * the provider would collect answers into nothing and lose them at the flush,
 * which is not a failure anyone would notice until the budget came out wrong.
 */
export function useOnboardingDraft(): DraftValue {
  const context = useContext(DraftContext)
  if (!context) throw new Error('useOnboardingDraft must be used inside <OnboardingDraftProvider>')
  return context
}
