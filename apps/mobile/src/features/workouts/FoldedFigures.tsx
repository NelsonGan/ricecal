import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { ReplayMask } from '@/lib/replay-mask'
import { Icon, Tappable, Text } from '@/ui'
import { workoutBurn } from './burn'
import { useEnergyBody } from './energyBody'
import { useNow } from './live'
import type { LiveWorkout } from './model'
import { useWatchEnergy, useWatchPulse } from './pulse'

/**
 * The burn so far, on its own five second clock, since an estimate moves
 * slowly and a watch streams no faster. The watch's own active energy is
 * health data and is kept out of session replays (`fromWatch`); our estimate,
 * shown without a watch, is not.
 */
export function useLiveBurn(workout: LiveWorkout) {
  const now = useNow(5000)
  const body = useEnergyBody()
  const watchKcal = useWatchEnergy(workout.id)
  const burn = workoutBurn(workout, (now - workout.startedAt) / 1000, body, watchKcal)
  return { burn, weighed: body !== undefined, fromWatch: watchKcal !== null }
}

/**
 * The folded row: heart rate and burn on one line, the whole row the toggle.
 *
 * It says its figures as its own label. A button with none reads out its
 * children's labels, and a replay mask's label is "ph-no-capture", which is
 * what VoiceOver and TalkBack then said in place of each masked figure.
 */
export function FoldedFigures({
  workout,
  pulsing,
  hint,
  onPress,
  chevron,
}: {
  workout: LiveWorkout
  pulsing: boolean
  hint: string
  onPress: () => void
  chevron: ReactNode
}) {
  const { t } = useTranslation(['workouts', 'activity'])
  const bpm = useWatchPulse(workout.id)
  const { burn, fromWatch } = useLiveBurn(workout)
  const bpmText = bpm === null ? null : t('activity:workout.bpm', { value: bpm })
  const kcalText =
    burn.kcal === null ? null : t('workouts:detail.kcal', { value: burn.kcal.toLocaleString() })
  const spoken = [pulsing ? bpmText : null, kcalText].filter(Boolean).join(', ')
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken || undefined}
      accessibilityHint={hint}
      accessibilityState={{ expanded: false }}
      className="flex-row items-center gap-3 py-2.5"
    >
      {pulsing ? (
        <>
          {bpmText === null ? null : (
            <ReplayMask>
              <View className="flex-row items-center gap-1">
                <Icon set="body" name="heart-rate" size={18} />
                <Text variant="label">{bpmText}</Text>
              </View>
            </ReplayMask>
          )}
          <View className="h-4 border-line border-l" />
        </>
      ) : null}
      <ReplayMask enabled={fromWatch}>
        <View className="flex-row items-center gap-1">
          <Icon set="body" name="flame-burn" size={18} />
          <Text variant="label">{kcalText ?? '—'}</Text>
        </View>
      </ReplayMask>
      <View className="flex-1" />
      {chevron}
    </Tappable>
  )
}
