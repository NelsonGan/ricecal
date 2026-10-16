import { FREE_ROUTINES } from '@ricecal/shared'

import { isRoutineLimit, useEntitlement, useRoutines } from '@/data'
import { openPaywall, proFeatureTitle } from '@/data/refusals'
import { useRequirePro } from '@/features/paywall'
import { useToast } from '@/ui'

/**
 * The free tier's routine ceiling, at the three places a routine is made: New
 * on the Workouts tab, "Add to my routines" on a template, and "Save as
 * routine" on a saved workout.
 *
 * `allowNew` is the button's check, from the list already on screen, so a free
 * account with three is shown the paywall before it builds a fourth rather
 * than at Save. `refused` is the write's: the trigger
 * (`workout_routines_enforce_free_limit`) still has the last word, for a
 * routine added on another phone or a list that had not loaded.
 */
export function useRoutineGate() {
  const toast = useToast()
  const requirePro = useRequirePro()
  const { entitled } = useEntitlement()
  const routines = useRoutines()
  const atLimit = !entitled && (routines.data?.length ?? 0) >= FREE_ROUTINES

  return {
    /** Whether a new routine may be started. Shows the paywall when not. */
    allowNew: (): boolean => !atLimit || requirePro('new_routine'),
    /** Handles a save the database refused for the ceiling; false for anything else. */
    refused: (error: unknown): boolean => {
      if (!isRoutineLimit(error)) return false
      openPaywall(toast, { title: proFeatureTitle('new_routine'), feature: 'new_routine' })
      return true
    },
  }
}
