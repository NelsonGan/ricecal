import { PaywallOffer, useMarkPaywallSeen } from '@/features/paywall'
import { useBack } from '@/lib/navigation'

/**
 * The standing paywall.
 *
 * It shares the full offer and purchase flow with onboarding, but it is a page
 * reached from the app and therefore keeps the back affordance.
 */
export default function Paywall() {
  const goBack = useBack('/today')

  // Seeing the price resets the standing offer's clock, however the user got
  // here. Without it, somebody refused at the shutter on Monday would meet the
  // same page unprompted on Wednesday having already read it.
  useMarkPaywallSeen()

  return <PaywallOffer screen="hard" onBack={goBack} />
}
