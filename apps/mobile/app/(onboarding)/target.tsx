import { format } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { goalDate, useAppState, useDispatch } from '@/mock'
import { Button, CalorieRing, Screen, StatTile, Text } from '@/ui'

/** 07 YOUR TARGET */
export default function TargetStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const dispatch = useDispatch()
  const { profile, targets } = useAppState((state) => ({
    profile: state.profile,
    targets: state.targets,
  }))

  const finish = new Date()
  const reachedOn = goalDate(profile, finish)

  // Roughly 600 kcal a meal is what a Malaysian plate runs to, so the budget
  // divided by that is the honest answer to "how much food is this?".
  const meals = Math.max(2, Math.round(targets.kcal / 600))

  const start = () => {
    dispatch({ type: 'completeOnboarding' })
    router.push('/account')
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
            onPress={() => {
              dispatch({ type: 'completeOnboarding' })
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
          value={targets.kcal}
          goal={targets.kcal}
          size={186}
          // A full ring here is the plan, not a day gone over, so the automatic
          // "you are at 100%" kaya would say the wrong thing.
          tone="pandan"
          centerLabel={targets.kcal.toLocaleString()}
          centerCaption={t('target.perDay')}
        />

        <Text className="text-center font-display text-[26px] leading-[32px] text-heading">
          {t('target.headline', { meals })}
        </Text>

        <View className="w-full flex-row gap-2.5">
          <StatTile
            className="flex-1"
            label={t('target.carbs')}
            value={t('common:unit.grams', { value: targets.carbs })}
          />
          <StatTile
            className="flex-1"
            label={t('target.protein')}
            value={t('common:unit.grams', { value: targets.protein })}
          />
          <StatTile
            className="flex-1"
            label={t('target.fat')}
            value={t('common:unit.grams', { value: targets.fat })}
          />
        </View>

        <Text className="text-center text-[15px] leading-[23px]">
          {reachedOn
            ? t('target.footnote', {
                weight: profile.targetWeightKg.toFixed(1),
                date: format(reachedOn, 'd MMMM'),
              })
            : t('target.footnoteMaintain', { weight: profile.weightKg.toFixed(1) })}
        </Text>
      </View>
    </Screen>
  )
}
