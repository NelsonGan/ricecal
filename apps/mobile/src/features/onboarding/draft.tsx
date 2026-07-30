import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { createMMKV } from 'react-native-mmkv'

import type { ActivityLevel, Goal, Sex } from '@/data'

/**
 * The onboarding answers, before there is an account to put them in.
 *
 * This exists because the questions come first now. A user answers seven screens
 * and only then is asked for an email, which means every answer has to live
 * somewhere that is not `profiles` — the profile row does not exist yet, and the
 * hooks that write it throw without a session rather than failing quietly.
 *
 * On disk rather than in memory, through MMKV, for two reasons. Onboarding is the
 * longest uninterrupted stretch of typing in the app and the most likely place to
 * be interrupted by something else on the phone, so answers surviving a restart
 * is the difference between resuming and starting again. And the router reads
 * `isComplete` to decide where a returning visitor belongs, which it cannot do
 * from state that died with the process.
 *
 * Reads are synchronous, so there is no loading state to thread through seven
 * screens — the first render already has the answers.
 */

const storage = createMMKV({ id: 'ricecal-onboarding' })
const KEY = 'draft'

export type OnboardingDraft = {
  goal?: Goal
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
  /**
   * Which screen the flow ends on once the account exists.
   *
   * Recorded on the target screen, because the choice is made there — "log my
   * first meal" or "explore first" — but acted on after the account step, which
   * sits between the two.
   */
  exit?: 'today' | 'preview'
}

/** A draft with every answer in it, which is what the flush needs. */
export type CompleteDraft = OnboardingDraft &
  Required<Omit<OnboardingDraft, 'exit'>> & { foodStyles: string[] }

/**
 * Whether there is enough here to build a profile and a budget.
 *
 * Every field the database's `compute_targets()` reads is required, which is most
 * of them: a partial flush leaves a signed-in user with no budget and no screen
 * offering to fix it.
 *
 * A type guard rather than a boolean, so the one place that reads all nine fields
 * does not need nine casts to say what this check has already established.
 */
export function isComplete(draft: OnboardingDraft): draft is CompleteDraft {
  return Boolean(
    draft.goal &&
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

export function OnboardingDraftProvider({ children }: { children: ReactNode }) {
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
