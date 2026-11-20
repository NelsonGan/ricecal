import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { OnboardingStep } from '@/features/onboarding'
import { useThemeColors } from '@/theme/useTheme'
import { Icon, Text } from '@/ui'

const BENCH = require('../../assets/exercises/barbell-bench-press.webp')

/**
 * The sample session. Exercise names come from the catalogue in English
 * whatever the interface is set to, so this one is written here.
 */
const EXERCISE = 'Bench Press (Barbell)'
const SETS = [
  { id: 'set-1', previous: '40 × 8', kg: '42.5', reps: '8' },
  { id: 'set-2', previous: '40 × 8', kg: '42.5', reps: '8' },
  { id: 'set-3', previous: '40 × 7', kg: '42.5', reps: '7' },
]

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
  const router = useRouter()
  const colors = useThemeColors()

  const stats = [
    { label: t('workouts:logger.duration'), value: '38:04' },
    { label: t('workouts:logger.volume'), value: '1,318 kg' },
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
                {set.previous}
              </Text>
              <Text variant="label" className="w-16 text-right">
                {set.kg} kg
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
