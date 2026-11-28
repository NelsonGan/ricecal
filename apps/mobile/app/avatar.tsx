import { AvatarScreen } from '@/features/avatar'
import { SessionGate } from '@/lib/SessionGate'

/** Your avatar, from the avatar on Today (README: The avatar on Today). */
export default function AvatarRoute() {
  return (
    <SessionGate>
      <AvatarScreen />
    </SessionGate>
  )
}
