import { PaywallOffer, useTrackPaywallShown } from '@/features/paywall'
import { useEnterApp } from '@/lib/navigation'

/**
 * The paywall at the end of onboarding.
 *
 * It uses the same offer and purchase flow as the standing paywall. The only
 * difference is where "Maybe later" goes: onboarding enters the app instead of
 * returning to a previously opened screen.
 */
export default function IntroPaywall() {
  const enterApp = useEnterApp()

  useTrackPaywallShown('intro')

  return <PaywallOffer screen="intro" onLater={enterApp} />
}
