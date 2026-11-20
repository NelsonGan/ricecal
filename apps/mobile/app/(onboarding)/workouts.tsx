import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { OnboardingStep, useOnboardingDraft } from '@/features/onboarding'
import { fromKg, UNIT_KEY, unitFor, type WeightUnit } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import { Icon, Text } from '@/ui'

const BENCH = require('../../assets/exercises/barbell-bench-press.webp')

/**
 * The sample session. Exercise names come from the catalogue in English
 * whatever the interface is set to, so this one is written here.
 */
const EXERCISE = 'Bench Press (Barbell)'
const SETS = [
  { id: 'set-1', previousKg: 40, previousReps: 8, kg: 42.5, reps: 8 },
  { id: 'set-2', previousKg: 40, previousReps: 8, kg: 42.5, reps: 8 },
  { id: 'set-3', previousKg: 40, previousReps: 7, kg: 42.5, reps: 7 },
]

/** The session's total, in kilograms like every weight the app stores. */
const VOLUME_KG = 1318

/**
 * A sample weight in the units chosen on setup. Pounds round to the nearest
 * five, which is what a bar loaded with pound plates can actually hold.
 */
function weight(kg: number, unit: WeightUnit): string {
  const value = unit === 'lb' ? Math.round(fromKg(kg, 'lb') / 5) * 5 : kg
  return value.toLocaleString()
}

/**
 * A showcase between the questions: the workout logger, drawn from its own
 * parts (the stat strip, an exercise with its sets, the previous column) so it
 * looks like the screen somebody will open, because it is that screen's shape.
 *
 * After `activity` because it is the same subject: somebody who has just said
 * they train most days is the person this is for.
 */
export default function WorkoutsStep() {
  const { t } = useTranslation(['onboarding', 'workouts', 'common'])
  const { draft } = useOnboardingDraft()
  // Asked two screens back; a sample in kilograms right after choosing pounds
  // would be the first thing in the flow to ignore the answer.
  const unit = unitFor(draft.units ?? 'metric')
  const unitLabel = t(UNIT_KEY[unit])
  const router = useRouter()
  const colors = useThemeColors()

  const stats = [
    { label: t('workouts:logger.duration'), value: '38:04' },
    {
      label: t('workouts:logger.volume'),
      value: `${Math.round(fromKg(VOLUME_KG, unit)).toLocaleString()} ${unitLabel}`,
    },
    { label: t('workouts:logger.sets'), value: '5' },
  ]

  return (
    <OnboardingStep
      name="workouts"
      art={{ set: 'scenes', name: 'dumbbell' }}
      title={t('workouts.title')}
      subtitle={t('workouts.subtitle')}
      onBack={() => router.dismissTo('/(onboarding)/activity')}
      primaryLabel={t('common:action.continue')}
      onPrimary={() => router.push('/(onboarding)/social')}
    >
      <View
        className="gap-3.5 rounded-tile border-2 border-line bg-surface p-4"
        accessible
        accessibilityLabel={`${t('workouts.routine')}, ${EXERCISE}`}
      >
        <Text variant="subtitle">{t('workouts.routine')}</Text>

        <View className="flex-row">
          {stats.map((stat, index) => (
            <View
              key={stat.label}
              className={index > 0 ? 'flex-1 border-l-2 border-line pl-3' : 'flex-1'}
            >
              <Text variant="overlineSm" numberOfLines={1}>
                {stat.label}
              </Text>
              <Text variant="numeric">{stat.value}</Text>
            </View>
          ))}
        </View>

        <View className="flex-row items-center gap-3">
          <View className="h-[48px] w-[48px] items-center justify-center overflow-hidden rounded-sm bg-exercise-tile">
            <Image source={BENCH} style={{ width: 44, height: 44 }} contentFit="contain" />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="bodyStrong" numberOfLines={1}>
              {EXERCISE}
            </Text>
            <View className="flex-row">
              <View className="flex-row items-center gap-1 rounded-full bg-kaya-soft px-2.5 py-0.5">
                <Icon set="body" name="stopwatch" size={14} />
                <Text variant="caption" className="text-kaya-ink">
                  {t('workouts:logger.rest', { time: '1:30' })}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View className="gap-1.5">
          {SETS.map((set, index) => (
            <View
              key={set.id}
              className="flex-row items-center gap-3 rounded-sm bg-pandan-soft px-3 py-2"
            >
              <Text variant="label" className="w-4">
                {index + 1}
              </Text>
              <Text variant="meta" className="flex-1">
                {`${weight(set.previousKg, unit)} × ${set.previousReps}`}
              </Text>
              <Text variant="label" className="w-16 text-right">
                {weight(set.kg, unit)} {unitLabel}
              </Text>
              <Text variant="label" className="w-6 text-right">
                {set.reps}
              </Text>
              <View className="h-6 w-6 items-center justify-center rounded-[8px] bg-pandan">
                <Icon set="ui" name="check" size={13} tintColor={colors.onPandan} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </OnboardingStep>
  )
}
