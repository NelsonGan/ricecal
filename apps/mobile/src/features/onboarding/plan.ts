import { type BodyInput, computeTargets } from '@/lib/nutrition'
import type { OnboardingDraft } from './draft'

/**
 * The body the budget is worked out for, from the answers so far.
 *
 * The defaults only matter if a screen was skipped, which the Continue gates do
 * not allow. They are here so the arithmetic cannot divide by nothing. The
 * target weight is part of the body because the gap between it and the weight
 * IS the plan: `finish` writes it to the profile and the trigger runs the same
 * arithmetic against it, so leaving it out is how a screen would promise a
 * budget the account then disagrees with.
 *
 * One function, because two screens show this number: the calculating beat
 * counts up to it and the target step opens on it, and they must agree.
 */
export function planBody(draft: OnboardingDraft): BodyInput {
  const weightKg = draft.weightKg ?? 65
  return {
    sex: draft.sex ?? 'female',
    weightKg,
    heightCm: draft.heightCm ?? 164,
    age: draft.age ?? 29,
    activity: draft.activity ?? 'light',
    targetWeightKg: draft.targetWeightKg ?? weightKg,
  }
}

/** The budget the target step will open on: an edit already made, or the formula's. */
export function planBudget(draft: OnboardingDraft) {
  return draft.targets ?? computeTargets(planBody(draft))
}
