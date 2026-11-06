import { HistoryScreen } from '@/features/progress'
import { SessionGate } from '@/lib/SessionGate'

/** Every water entry behind the Trends water card, newest first. See `HistoryScreen`. */
export default function WaterHistoryRoute() {
  return (
    <SessionGate>
      <HistoryScreen metric="water" />
    </SessionGate>
  )
}
