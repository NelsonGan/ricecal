import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { TablesUpdate } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { unwrapMaybe, unwrapOne } from './client'
import { keys } from './keys'
import { useSession, useUserId } from './session'
import type { ActivityLevel, Goal, Profile, Sex } from './types'
import { toDbActivity } from './types'

/**
 * The signed-in user's profile row.
 *
 * Created by the `on_auth_user_created` trigger, so it exists from the instant
 * the account does — this never has to handle "no row yet", only "not loaded
 * yet". `maybeSingle` rather than `single` all the same: a profile deleted out
 * from under the app is a null to route on, not an exception to crash on.
 */
export function useProfile() {
  const { userId } = useSession()

  return useQuery({
    queryKey: keys.profile(userId ?? 'anonymous'),
    enabled: Boolean(userId),
    queryFn: async () =>
      unwrapMaybe(
        await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId as string)
          .maybeSingle(),
      ),
  })
}

/** The fields onboarding and the settings screens can write. */
export type ProfilePatch = {
  displayName?: string
  sex?: Sex
  birthDate?: string
  heightCm?: number
  targetWeightKg?: number
  activity?: ActivityLevel
  goal?: Goal
  foodStyles?: string[]
  referralSource?: string
  timezone?: string
}

function toRow(patch: ProfilePatch): TablesUpdate<'profiles'> {
  // Undefined keys are dropped rather than sent as null: a partial update must
  // not blank a column the caller never mentioned.
  const row: TablesUpdate<'profiles'> = {}
  if (patch.displayName !== undefined) row.display_name = patch.displayName
  if (patch.sex !== undefined) row.sex = patch.sex
  if (patch.birthDate !== undefined) row.birth_date = patch.birthDate
  if (patch.heightCm !== undefined) row.height_cm = patch.heightCm
  if (patch.targetWeightKg !== undefined) row.target_weight_kg = patch.targetWeightKg
  if (patch.activity !== undefined) row.activity_level = toDbActivity(patch.activity)
  if (patch.goal !== undefined) row.weight_goal = patch.goal
  if (patch.foodStyles !== undefined) row.food_styles = patch.foodStyles
  if (patch.referralSource !== undefined) row.referral_source = patch.referralSource
  if (patch.timezone !== undefined) row.timezone = patch.timezone
  return row
}

/**
 * Writes the profile, and refreshes the budget with it.
 *
 * A body change recomputes `daily_goals` inside the database (the trigger in
 * `80_goals_sync.sql`), so the targets in the cache are stale the moment this
 * returns. Invalidating them here rather than at each call site is what keeps
 * the ring on Today honest after an edit three screens away.
 */
export function useUpdateProfile() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (patch: ProfilePatch) =>
      unwrapOne(
        await supabase.from('profiles').update(toRow(patch)).eq('id', userId).select('*').single(),
      ),
    onSuccess: (profile: Profile) => {
      queryClient.setQueryData(keys.profile(userId), profile)
      queryClient.invalidateQueries({ queryKey: keys.goals(userId) })
    },
  })
}

/**
 * Marks onboarding done.
 *
 * A timestamp rather than a boolean, and the router reads it: "when" answers
 * questions "whether" cannot, and it is the last write of the flow so a user
 * who quits halfway comes back to where they stopped.
 */
export function useCompleteOnboarding() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () =>
      unwrapOne(
        await supabase
          .from('profiles')
          .update({ onboarded_at: new Date().toISOString() })
          .eq('id', userId)
          .select('*')
          .single(),
      ),
    onSuccess: (profile: Profile) => queryClient.setQueryData(keys.profile(userId), profile),
  })
}
