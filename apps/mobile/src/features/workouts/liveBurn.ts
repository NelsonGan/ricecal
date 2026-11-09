import { useTranslation } from 'react-i18next'

import { workoutBurn } from './burn'
import { useEnergyBody } from './energyBody'
import { useNow } from './live'
import type { LiveWorkout } from './model'
import { useWatchEnergy } from './pulse'

/**
 * The burn so far on the live workout, on its own five second clock, since an
 * estimate moves slowly and a watch streams no faster. `text` is the figure as
 * shown, null while there is none.
 *
 * `fromWatch` is whether the figure is the watch's own active energy, which is
 * health data and kept out of session replays. It follows the figure's source
 * rather than whether energy has streamed: after a relaunch mid-workout the
 * figure is the one saved on the document, still the watch's. Our estimate,
 * shown without a watch, is not masked.
 */
export function useLiveBurn(workout: LiveWorkout) {
  const { t } = useTranslation(['workouts'])
  const now = useNow(5000)
  const body = useEnergyBody()
  const watchKcal = useWatchEnergy(workout.id)
  const burn = workoutBurn(workout, (now - workout.startedAt) / 1000, body, watchKcal)
  const text =
    burn.kcal === null ? null : t('workouts:detail.kcal', { value: burn.kcal.toLocaleString() })
  return { burn, text, weighed: body !== undefined, fromWatch: burn.source === 'watch' }
}
