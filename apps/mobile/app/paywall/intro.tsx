import { PaywallOffer, useTrackPaywallShown } from '@/features/paywall'
import { useEnterApp } from '@/lib/navigation'

/**
 * The paywall at the end of onboarding.
 *
 * It uses the same offer and purchase flow as the standing paywall. The only
 * difference is how somebody leaves without buying: onboarding has no previous
 * app screen, so it offers "Maybe later" instead of a back button.
 */
export default function IntroPaywall() {
  const enterApp = useEnterApp()

  useTrackPaywallShown('intro')

  return <PaywallOffer screen="intro" onLater={enterApp} />
}
