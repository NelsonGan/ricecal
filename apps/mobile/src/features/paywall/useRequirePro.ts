import { useTranslation } from 'react-i18next'

import { useEntitlement } from '@/data'
import { openPaywall, proFeatureTitle } from '@/data/refusals'
import type { ProFeature } from '@/lib/analytics'
import { useToast } from '@/ui'

export type RequireProOptions = {
  /**
   * How to get to the paywall, and it depends on what is calling.
   *
   * `push` is right from an ordinary page: the screen underneath is worth
   * coming back to, and on the food detail screen it is holding a portion the
   * user has just composed.
   *
   * `replace` is required from inside a MODAL. `/log` is a `transparentModal`,
   * and a push from within one lands on the stack that lives INSIDE that
   * presentation — the paywall would come up as a second modal stacked on the
   * sheet, half-covering it, with the sheet's own scrim still over the app.
   */
  navigate?: 'push' | 'replace'

  /**
   * Run once, immediately before the paywall is presented, and only then.
   *
   * FOR A CALLER THAT IS INSIDE A `Sheet`, which is a native `Modal` and so its
   * own window above the whole app: a paywall pushed from under one arrives
   * BEHIND it, and the user is left looking at the sheet they were already in.
   * `replace` does not help, unlike the `transparentModal` case above — that is
   * a route, and this is a window. The sheet has to actually close, and only
   * the caller can close it.
   *
   * Called on the REFUSAL alone, which is the whole reason it is a callback
   * rather than something the caller does before asking. The other two answers
   * — still checking, could not check — say so in a toast and go nowhere, and a
   * caller that dismissed its own sheet up front would throw away a form the
   * user had just filled in to be told "just a moment".
   */
  beforePaywall?: () => void
}

/**
 * The one place a paid feature is refused, and it always refuses the same way.
 *
 * THE SHUTTER IS NOT HERE ANY MORE, deliberately. A free account photographs
 * three plates a day and the count is the server's, claimed per scan; a copy of
 * it in the client would be wrong the first time the phone was offline or a
 * second device scanned. So that refusal arrives as a 429 and
 * `announceRefusal` in `data/refusals.ts` opens the same paywall this does.
 *
 * ONE PAYWALL, NOT A VARIANT PER BUTTON — AND ONE SENTENCE PER BUTTON. The
 * screen is shared and the toast in front of it is not: which capability was
 * refused is the one thing the paywall cannot say for itself, and it is the
 * thing the person with a finger on the button needs to hear. See
 * `proFeatureTitle`.
 *
 * There were three whole paywall SCREENS once: "Photo logging is a Pro
 * feature", "Describing a meal is a Pro feature", "Logging a meal is a Pro
 * feature", each with its own hero icon and its own three bullet points about
 * what that particular button would have done. They were three ways of saying
 * one thing — this needs Pro — and the differences between them were writing
 * rather than information. Worse, none of them showed a price: somebody who
 * had decided to buy still had to get past the explanation to reach the plans.
 *
 * So every refusal goes to the standard paywall, which names the plans and the
 * prices and gets out of the way.
 *
 * WHY A GUARD AND NOT A DISABLED BUTTON. Every gated control stays live and
 * pressable, because the point of the paywall is to be reached: a greyed-out
 * shutter tells a user they cannot do something and gives them nowhere to go,
 * while a shutter that opens the paywall tells them what it costs.
 *
 * Reads as a single early return at the call site, naming the button being
 * guarded:
 *
 *     if (!requirePro('describe')) return
 *     describeFood(...)
 *
 * THE FEATURE IS AN ARGUMENT TO THE RETURNED FUNCTION rather than an option on
 * the hook, because one screen guards several buttons with one hook — the quick
 * selector's shutter, describe panel and quick add are all the same instance.
 * It exists so `Paywall Shown` can say which capability was refused, which is
 * the only way to find out what actually sells the app: the paywall screen
 * cannot know why it was opened.
 *
 * WAITS FOR THE ANSWER rather than assuming one. While the entitlement is still
 * being worked out this refuses, says so in a toast, and shows no paywall —
 * nobody has been refused a feature, so there is nothing to sell them yet. A
 * cold launch resolves it in milliseconds, and the alternatives are both worse:
 * assume paid and a free account gets a photo upload and a model call before
 * being refused, or assume unpaid and a paying user is shown a paywall for the
 * app they have already bought.
 *
 * That answer now has TWO sources — our own mirror of the subscription, and
 * what the store itself told this device. See `useEntitlement`: either saying
 * yes is enough, which is what stops a purchase spending the webhook's latency
 * behind the paywall it just paid to get past.
 */
export function useRequirePro(options: RequireProOptions = {}): (feature: ProFeature) => boolean {
  const { navigate = 'push', beforePaywall } = options
  const toast = useToast()
  const { t } = useTranslation('paywall')
  const { entitled, loading, unknown } = useEntitlement()

  return (feature: ProFeature) => {
    if (entitled) return true

    // The answer has not arrived. NOT a refusal — nobody has been told they
    // cannot do this — so there is no paywall and no funnel event, but there is
    // a sentence: silence here is indistinguishable from a broken button, and
    // it was the one path in this hook that left a tap doing nothing at all.
    // A cold launch resolves this in milliseconds, so it is rarely seen; when
    // it is, it is somebody tapping into a launch and the honest thing to say
    // is that we are still looking.
    if (loading) {
      toast.show({ title: t('checking') })
      return false
    }

    // We asked and could not find out — offline, most likely. Saying "you have
    // not paid" here would be a lie told to exactly the people most likely to
    // have paid, so it says what actually happened instead.
    if (unknown) {
      toast.show({ title: t('couldNotCheck'), tone: 'warning' })
      return false
    }

    // THE TOAST AND THE PAYWALL TOGETHER, which is what `announceRefusal` does
    // for a refusal that started on the server, and for the same reason. This
    // used to be the paywall alone: a price list arriving over the screen you
    // were on, with nothing saying which of the buttons under your thumb had
    // just declined to work. `openPaywall` also carries the `Paywall Shown`
    // event, so a gate caught in the app and a limit reached on the server land
    // in the funnel as one thing rather than two.
    // The caller's own window gets out of the way first, if it has one. See
    // `beforePaywall`: a paywall pushed from under a `Sheet` is a paywall
    // nobody can see.
    beforePaywall?.()
    // NAMED, not "that one". `proFeatureTitle` is shared with the refusals that
    // start on the server, so the same button refused by the app and by an edge
    // function reads identically.
    openPaywall(toast, { title: proFeatureTitle(feature), feature, navigate })
    return false
  }
}
