import { HistoryScreen } from '@/features/progress'
import { SessionGate } from '@/lib/SessionGate'

/** Every calories entry behind the Trends card, newest first. See `HistoryScreen`. */
export default function CaloriesHistoryRoute() {
  return (
    <SessionGate>
      <HistoryScreen metric="calories" />
    </SessionGate>
  )
}
