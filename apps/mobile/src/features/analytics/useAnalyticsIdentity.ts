import { useEffect, useRef } from 'react'

import { fromDbActivity, useEntitlement, useMealTimes, useProfile } from '@/data'
import { setPersonProps, setSuperProps } from '@/lib/analytics'

/**
 * Keeps Mixpanel's picture of WHO this account is in step with the profile.
 *
 * WHY A HOOK AT ALL, when `finish.tsx` already writes every one of these the
 * moment onboarding lands. Two reasons, and the second is the load-bearing one:
 *
 * 1. A profile is edited afterwards — the activity level on the goals screen,
 *    say — and a segment built on an answer from a year ago is a segment about
 *    somebody who no longer exists.
 * 2. **An account that onboarded on another handset has never run that code.**
 *    Signing in on a new phone, or reinstalling, gives Mixpanel a fresh device
 *    with no profile properties at all, and there is no second onboarding to
 *    fill them in. This runs on every launch into the app.
 *
 * Mounted next to `useReminderSync` and `useHealthAutoSync` in the tabs layout,
 * for the reason those two are: it is a background rule about the account
 * rather than anything a screen owns. Renders nothing.
 *
 * `features/` rather than `lib/`, because it reads the data layer — the
 * analytics module underneath it deliberately imports nothing at all.
 */
export function useAnalyticsIdentity(): void {
  const { data: profile } = useProfile()
  const { data: mealTimes } = useMealTimes()
  const { entitled, loading, unknown } = useEntitlement()

  /**
   * What was last sent, so an unchanged profile refetching does not resend it.
   *
   * A signature rather than a dependency list, because `profile` is a new
   * object on every refetch — a reference comparison would fire this on every
   * window focus for the life of the session, and Mixpanel's people API is a
   * network call apiece.
   */
  const lastPerson = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!profile) return

    const props = {
      onboarded: Boolean(profile.onboarded_at),
      // Undefined rather than null for an unfinished profile: `setPersonProps`
      // passes the object through, and null would overwrite a good answer with
      // "we do not know" the first time this ran before the write landed.
      onboarded_at: profile.onboarded_at ?? undefined,
      // Through `fromDbActivity`, because the column says `very_active` and
      // the draft `finish.tsx` sends says `veryActive`. Two writers, one
      // property: they have to agree on the vocabulary or the breakdown splits
      // in half. `PersonProps` types this so they cannot drift again.
      activity_level: profile.activity_level ? fromDbActivity(profile.activity_level) : undefined,
      // No `food_styles`. Onboarding stopped asking, so the column is empty on
      // every account made since — and a property that only some accounts can
      // ever carry is a breakdown that quietly means "signed up before August".
      referral_source: profile.referral_source ?? undefined,
    }
    // No `plan_direction` here. It needs the current weight beside the target,
    // and the current weight is the newest `weight_logs` row rather than a
    // column on the profile — a second query, refetched on every foreground by
    // the health sync, to keep a property that only moves when somebody changes
    // their goal. `finish.tsx` sets it, and the goals screen is where it would
    // be worth updating if it ever needs to be.

    const signature = JSON.stringify(props)
    if (lastPerson.current === signature) return
    lastPerson.current = signature
    setPersonProps(props)
  }, [profile])

  const lastReminders = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!mealTimes) return
    const count = mealTimes.filter((row) => row.reminder_enabled).length
    if (lastReminders.current === count) return
    lastReminders.current = count
    setPersonProps({ meal_reminders: count })
  }, [mealTimes])

  /**
   * The one super property, stamped on every event from here on.
   *
   * `unknown` is the case worth naming: offline with nothing cached, the
   * subscription query has no answer, and registering `entitled: false` there
   * would mark a paying user's whole offline session as free. So it waits, and
   * events fired before the answer arrives simply carry no `entitled` at all —
   * which reads honestly in Mixpanel as "not set" rather than as a lie.
   */
  useEffect(() => {
    if (loading || unknown) return
    setSuperProps({ entitled })
  }, [entitled, loading, unknown])
}
