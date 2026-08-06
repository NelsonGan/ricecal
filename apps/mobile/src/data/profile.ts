import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { TablesUpdate } from '@/lib/database.types'
import type { BodyInput } from '@/lib/nutrition'
import { ageFrom } from '@/lib/nutrition'
import { supabase } from '@/lib/supabase'
import { today, unwrapMaybe, unwrapOne } from './client'
import { keys } from './keys'
import { useSession, useUserId } from './session'
import type { ActivityLevel, Goal, Profile, Sex } from './types'
import { fromDbActivity, toDbActivity } from './types'

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
  /**
   * A key in R2, never a URL — the key `uploadAvatar` returned. `null` clears
   * the picture and goes back to the stock figure.
   *
   * Storing the key is what makes the storage provider a detail: it changed
   * once already, and a column full of URLs would have been a migration over
   * every row rather than a different base to sign against.
   */
  avatarPath?: string | null
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
  if (patch.avatarPath !== undefined) row.avatar_path = patch.avatarPath
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
    /**
     * The patch lands in the cache before the request leaves.
     *
     * Two things need it. The onboarding steps read their own selected state
     * back out of the profile, so without this a tap on a choice card shows
     * nothing at all until the round trip finishes. And a patch computed from
     * the current value — the food style chips, which toggle against
     * `food_styles` — reads the previous answer from exactly this cache: two
     * quick taps that both start from the server's copy means the second
     * silently drops the first.
     */
    onMutate: async (patch: ProfilePatch) => {
      const key = keys.profile(userId)
      // A fetch already in flight would resolve after this and put the old row
      // back, which looks like the tap undoing itself.
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Profile>(key)
      if (previous) queryClient.setQueryData<Profile>(key, { ...previous, ...toRow(patch) })
      return { previous }
    },
    onError: (_error, _patch, context) => {
      // Back to what the server last said, so a screen never goes on claiming
      // an answer that was never stored.
      if (context?.previous) queryClient.setQueryData(keys.profile(userId), context.previous)
    },
    onSuccess: (profile: Profile) => {
      queryClient.setQueryData(keys.profile(userId), profile)
      queryClient.invalidateQueries({ queryKey: keys.goals(userId) })
    },
  })
}

/**
 * A stored profile as the nutrition maths wants it.
 *
 * Three screens need this and each was building it inline, complete with its own
 * copy of the activity spelling ternary. Null when the profile is not complete
 * enough to compute anything: a budget derived from a missing height is a number
 * with no meaning, and `null` makes the caller say what to show instead.
 *
 * `overrides` is for the goals screen, which shows what a plan WOULD cost before
 * the profile carrying it has been saved. Everywhere else the stored row is the
 * answer and the argument is left out.
 */
export function bodyFrom(
  profile: Profile | null | undefined,
  weightKg: number | undefined,
  overrides?: { goal?: Goal; targetWeightKg?: number | null },
): BodyInput | null {
  if (!profile || !weightKg || !profile.sex || !profile.height_cm || !profile.birth_date)
    return null

  // Null and undefined part company here. A profile with no target weight has
  // never had one and the budget falls back to the goal's nominal pace; an
  // override the caller did not mention is one they have no opinion about, and
  // the stored value stands.
  const stored = profile.target_weight_kg == null ? null : Number(profile.target_weight_kg)
  const target = overrides?.targetWeightKg !== undefined ? overrides.targetWeightKg : stored

  return {
    sex: profile.sex,
    weightKg,
    heightCm: Number(profile.height_cm),
    age: ageFrom(profile.birth_date),
    activity: profile.activity_level ? fromDbActivity(profile.activity_level) : 'sedentary',
    goal: overrides?.goal ?? profile.weight_goal ?? 'track',
    targetWeightKg: target,
  }
}

/** Everything onboarding collected, in the client's own spelling. */
export type OnboardingAnswers = ProfilePatch & {
  /** Becomes the first weigh-in. There is no `weight_kg` on `profiles`. */
  weightKg: number
}

/**
 * Writes the whole of onboarding, and marks it done.
 *
 * The questions come before the account, so none of them could be saved as they
 * were answered — this is the one write the flow makes, and it runs the moment a
 * session exists.
 *
 * Ordered, not parallel, and the order is the point:
 *
 * 1. **The profile.** `compute_targets()` reads sex, birth date, height, activity
 *    and goal, so all of them have to be in place before anything asks it to run.
 * 2. **The weigh-in.** This is what asks. The trigger recomputes `daily_goals`
 *    from the newest reading, so a budget exists from here on.
 * 3. **`onboarded_at`.** Last, because it is what the router reads. Setting it
 *    before the other two means a failure strands the user in the app with no
 *    budget and no way back to the questions that would produce one.
 */
export function useFinishOnboarding() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ weightKg, ...patch }: OnboardingAnswers) => {
      unwrapOne(
        await supabase.from('profiles').update(toRow(patch)).eq('id', userId).select('id').single(),
      )

      unwrapOne(
        await supabase
          .from('weight_logs')
          .upsert(
            { user_id: userId, measured_on: today(), weight_kg: weightKg },
            { onConflict: 'user_id,measured_on' },
          )
          .select('measured_on')
          .single(),
      )

      return unwrapOne(
        await supabase
          .from('profiles')
          .update({ onboarded_at: new Date().toISOString() })
          .eq('id', userId)
          .select('*')
          .single(),
      )
    },
    onSuccess: (profile: Profile) => {
      queryClient.setQueryData(keys.profile(userId), profile)
      // Both were computed server-side during the writes above, so neither
      // cache has ever seen them.
      queryClient.invalidateQueries({ queryKey: keys.goals(userId) })
      queryClient.invalidateQueries({ queryKey: keys.weighIns(userId) })
    },
  })
}
