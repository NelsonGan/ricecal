import { PaywallOffer, useMarkPaywallSeen } from '@/features/paywall'
import { useBack } from '@/lib/navigation'
import { SessionGate } from '@/lib/SessionGate'

/**
 * The standing paywall.
 *
 * It shares the full offer and purchase flow with onboarding. Only the result
 * of "Maybe later" differs: this route returns to where the user came from.
 */
export default function PaywallRoute() {
  return (
    <SessionGate>
      <Paywall />
    </SessionGate>
  )
}

function Paywall() {
  const goBack = useBack('/today')

  // Seeing the price resets the standing offer's clock, however the user got
  // here. Without it, somebody refused at the shutter on Monday would meet the
  // same page unprompted on Wednesday having already read it.
  useMarkPaywallSeen()

  return <PaywallOffer screen="hard" onLater={goBack} />
}
