import { HistoryScreen } from '@/features/progress'
import { SessionGate } from '@/lib/SessionGate'

/** Every weight entry behind the Trends card, newest first. See `HistoryScreen`. */
export default function WeightHistoryRoute() {
  return (
    <SessionGate>
      <HistoryScreen metric="weight" />
    </SessionGate>
  )
}
