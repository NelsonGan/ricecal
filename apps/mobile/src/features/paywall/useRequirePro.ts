import { useTranslation } from 'react-i18next'

import { useEntitlement } from '@/data'
import { openPaywall, proFeatureTitle } from '@/data/refusals'
import type { ProFeature } from '@/lib/analytics'
import { useToast } from '@/ui'

export type RequireProOptions = {
  /**
   * `push` from an ordinary page, so the screen underneath is still there to
   * come back to.
   *
   * `replace` from inside a `transparentModal` such as `/log`: a push from
   * within one lands on the stack inside that presentation, so the paywall
   * comes up as a second modal half-covering the sheet.
   */
  navigate?: 'push' | 'replace'

  /**
   * Run immediately before the paywall is presented, for a caller inside a
   * `Sheet`. A sheet is a native `Modal` and so its own window: a paywall
   * pushed from under one arrives behind it, and `replace` does not help
   * because that is a route and this is a window. Only the caller can close it.
   *
   * Called on the refusal alone. The other two answers go nowhere, and a caller
   * that dismissed its own sheet up front would throw away a filled-in form to
   * be told "just a moment".
   */
  beforePaywall?: () => void
}

/**
 * The one place a paid feature is refused, and it always refuses the same way.
 *
 * The shutter is not here: the daily scan count is the server's, claimed per
 * scan, and a copy in the client would be wrong the first time the phone was
 * offline. That refusal arrives as a 429 and `announceRefusal` in
 * `data/refusals.ts` opens the same paywall.
 *
 * One paywall for every button, with a different sentence in front of it.
 * Which capability was refused is the one thing the paywall cannot say for
 * itself. There were three whole paywall screens once, differing only in
 * writing, and none of them showed a price.
 *
 * Gated controls stay live and pressable rather than greyed out: a disabled
 * button says no and gives the user nowhere to go.
 *
 * Reads as an early return at the call site:
 *
 *     if (!requirePro('describe')) return
 *     describeFood(...)
 *
 * The feature is an argument to the returned function rather than an option on
 * the hook, because one screen guards several buttons with one instance. It
 * exists so `Paywall Shown` can name the capability refused.
 *
 * While the entitlement is still unknown this refuses, says so in a toast and
 * shows no paywall: nobody has been refused a feature yet. Assuming paid would
 * cost a photo upload and a model call; assuming unpaid shows a paywall to
 * somebody who has already bought the app. See `useEntitlement` for why the
 * answer has two sources.
 */
export function useRequirePro(options: RequireProOptions = {}): (feature: ProFeature) => boolean {
  const { navigate = 'push', beforePaywall } = options
  const toast = useToast()
  const { t } = useTranslation('paywall')
  const { entitled, loading, unknown } = useEntitlement()

  return (feature: ProFeature) => {
    if (entitled) return true

    // Not a refusal, so no paywall and no funnel event. There is still a
    // sentence, because silence here is indistinguishable from a broken button.
    if (loading) {
      toast.show({ title: t('checking') })
      return false
    }

    // Offline, most likely. Saying "you have not paid" here would be a lie told
    // to exactly the people most likely to have paid.
    if (unknown) {
      toast.show({ title: t('couldNotCheck'), tone: 'warning' })
      return false
    }

    // The toast and the paywall together, as `announceRefusal` does for a
    // server-side refusal. The paywall alone was a price list arriving with
    // nothing saying which button had just declined to work. `openPaywall`
    // carries the `Paywall Shown` event, so an app-side gate and a server-side
    // limit land in the funnel as one thing.
    beforePaywall?.()
    // `proFeatureTitle` is shared with the server-side refusals, so the same
    // button reads identically whichever side stopped it.
    openPaywall(toast, { title: proFeatureTitle(feature), feature, navigate })
    return false
  }
}
