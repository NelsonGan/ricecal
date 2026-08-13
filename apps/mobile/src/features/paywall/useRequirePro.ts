import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { useEntitlement } from '@/data'
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
}

/**
 * The one place a paid feature is refused, and it always refuses the same way.
 *
 * ONE PAYWALL, NOT A VARIANT PER BUTTON. There were three: "Photo logging is a
 * Pro feature", "Describing a meal is a Pro feature", "Logging a meal is a Pro
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
 * Reads as a single early return at the call site:
 *
 *     if (!requirePro()) return
 *     snapFood(...)
 *
 * WAITS FOR THE ANSWER rather than assuming one. While the subscription query
 * is still in flight this refuses and says nothing at all — no paywall, no
 * toast. A cold launch resolves it in milliseconds, and the alternatives are
 * both worse: assume paid and a free account gets a photo upload and a model
 * call before being refused, or assume unpaid and a paying user is shown a
 * paywall for the app they have already bought.
 */
export function useRequirePro(options: RequireProOptions = {}): () => boolean {
  const { navigate = 'push' } = options
  const router = useRouter()
  const toast = useToast()
  const { t } = useTranslation('paywall')
  const { entitled, loading, unknown } = useEntitlement()

  return () => {
    if (entitled) return true
    if (loading) return false

    // We asked and could not find out — offline, most likely. Saying "you have
    // not paid" here would be a lie told to exactly the people most likely to
    // have paid, so it says what actually happened instead.
    if (unknown) {
      toast.show({ title: t('couldNotCheck'), tone: 'warning' })
      return false
    }

    if (navigate === 'replace') router.replace('/paywall')
    else router.push('/paywall')
    return false
  }
}
