import { format } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useCompleteOnboarding, useCurrentWeight, useProfile, useTargets } from '@/data'
import { goalDate } from '@/lib/nutrition'
import { Button, CalorieRing, Screen, StatTile, Text } from '@/ui'

/** 07 YOUR TARGET */
export default function TargetStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { data: profile } = useProfile()
  // Computed by the database the moment the body and the first weigh-in are
  // both in, which happened two screens ago — this screen only reads it.
  const { data: targets } = useTargets()
  const completeOnboarding = useCompleteOnboarding()
  const current = useCurrentWeight() ?? 0

  const finish = new Date()
  const reachedOn = goalDate(
    profile?.weight_goal ?? 'track',
    current,
    Number(profile?.target_weight_kg ?? current),
    finish,
  )

  // Roughly 600 kcal a meal is what a Malaysian plate runs to, so the budget
  // divided by that is the honest answer to "how much food is this?".
  const meals = Math.max(2, Math.round((targets?.kcal ?? 0) / 600))

  const start = async () => {
    await completeOnboarding.mutateAsync()
    router.replace('/today')
  }

  return (
    <Screen
      scroll={false}
      contentClassName="justify-center"
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={start}>
            {t('target.logFirst')}
          </Button>
          <Button
            variant="ghost"
            fullWidth
            onPress={async () => {
              await completeOnboarding.mutateAsync()
              router.replace('/preview')
            }}
          >
            {t('target.explore')}
          </Button>
        </View>
      }
    >
      <View className="items-center gap-5">
        <CalorieRing
          value={targets?.kcal ?? 0}
          goal={targets?.kcal ?? 0}
          size={186}
          // A full ring here is the plan, not a day gone over, so the automatic
          // "you are at 100%" kaya would say the wrong thing.
          tone="pandan"
          centerLabel={(targets?.kcal ?? 0).toLocaleString()}
          centerCaption={t('target.perDay')}
        />

        <Text variant="screenTitle" className="text-center">
          {t('target.headline', { meals })}
        </Text>

        <View className="w-full flex-row gap-2.5">
          <StatTile
            className="flex-1"
            label={t('target.carbs')}
            value={t('common:unit.grams', { value: targets?.carbs ?? 0 })}
          />
          <StatTile
            className="flex-1"
            label={t('target.protein')}
            value={t('common:unit.grams', { value: targets?.protein ?? 0 })}
          />
          <StatTile
            className="flex-1"
            label={t('target.fat')}
            value={t('common:unit.grams', { value: targets?.fat ?? 0 })}
          />
        </View>

        <Text className="text-center text-[15px] leading-[23px]">
          {reachedOn
            ? t('target.footnote', {
                weight: Number(profile?.target_weight_kg ?? 0).toFixed(1),
                date: format(reachedOn, 'd MMMM'),
              })
            : t('target.footnoteMaintain', { weight: current.toFixed(1) })}
        </Text>
      </View>
    </Screen>
  )
}
