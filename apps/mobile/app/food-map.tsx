import { FoodMapScreen } from '@/features/places'
import { SessionGate } from '@/lib/SessionGate'

/** The food map, from the map button on Today (README: Meal locations). */
export default function FoodMapRoute() {
  return (
    <SessionGate>
      <FoodMapScreen />
    </SessionGate>
  )
}
