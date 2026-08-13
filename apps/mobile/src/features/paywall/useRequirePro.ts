import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { useEntitlement } from '@/data'
import { useToast } from '@/ui'

/**
 * Which gated thing was reached for. Names a block in the `gate` copy bundle,
 * so adding one is copy plus a line here rather than a new screen.
 *
 * Must stay in step with `Feature` in `app/paywall/gate.tsx`, which is the
 * screen these land on. Nothing typechecks the pair — a router param is a
 * string as far as the compiler is concerned.
 */
export type ProFeature = 'photo' | 'describe' | 'log'

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
   * It is the same trap `openFood` in that file documents, and the same
   * answer: replace the sheet, so the paywall lands on the stack above Today.
   */
  navigate?: 'push' | 'replace'
}

/**
 * The one place a paid feature is refused.
 *
 * WHY A GUARD AND NOT A DISABLED BUTTON. Every one of these controls stays
 * live and pressable for somebody who has not paid, because the point of the
 * paywall is to be reached: a greyed-out shutter tells a user they cannot do
 * something and gives them nowhere to go, while a shutter that opens the
 * paywall tells them what it costs. It is also what the brief asks for — the
 * camera opens and frames the plate, and only the sending is stopped.
 *
 * Returns false and navigates when the account may not proceed, so a call site
 * reads as a single early return:
 *
 *     if (!requirePro('photo')) return
 *     snapFood(...)
 *
 * WAITS FOR THE ANSWER rather than assuming one. While the subscription query
 * is still in flight this refuses and says nothing at all — no paywall, no
 * toast. A cold launch resolves it in milliseconds, and the alternatives are
 * both worse: assume paid and a free account gets a photo upload and a model
 * call before being refused, or assume unpaid and a paying user is shown a
 * paywall for the app they have already bought.
 */
export function useRequirePro(options: RequireProOptions = {}): (feature: ProFeature) => boolean {
  const { navigate = 'push' } = options
  const router = useRouter()
  const toast = useToast()
  const { t } = useTranslation('paywall')
  const { entitled, loading, unknown } = useEntitlement()

  return (feature: ProFeature) => {
    if (entitled) return true
    if (loading) return false

    // We asked and could not find out — offline, most likely. Saying "you have
    // not paid" here would be a lie told to exactly the people most likely to
    // have paid, so it says what actually happened instead.
    if (unknown) {
      toast.show({ title: t('gate.couldNotCheck'), tone: 'warning' })
      return false
    }

    const to = { pathname: '/paywall/gate', params: { feature } } as const
    if (navigate === 'replace') router.replace(to)
    else router.push(to)
    return false
  }
}
