import { format } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useCompleteOnboarding, useCurrentWeight, useProfile, useTargets } from '@/data'
import { goalDate } from '@/lib/nutrition'
import { Button, CalorieRing, EmptyState, Screen, Skeleton, StatTile, Text, useToast } from '@/ui'

/** 07 YOUR TARGET */
export default function TargetStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const toast = useToast()
  const { data: profile } = useProfile()
  // Computed by the database the moment the body and the first weigh-in are
  // both in, which happened two screens ago — this screen only reads it. The
  // read is a fresh one, because writing either of those invalidated it, so
  // `isPending` here is the ordinary first frame rather than a rare one.
  const { data: targets, isPending } = useTargets()
  const completeOnboarding = useCompleteOnboarding()
  const current = useCurrentWeight() ?? 0

  const reachedOn = goalDate(
    profile?.weight_goal ?? 'track',
    current,
    Number(profile?.target_weight_kg ?? current),
    new Date(),
  )

  // Roughly 600 kcal a meal is what a Malaysian plate runs to, so the budget
  // divided by that is the honest answer to "how much food is this?".
  const meals = Math.max(2, Math.round((targets?.kcal ?? 0) / 600))

  /**
   * The last write of the flow, and the one the router reads.
   *
   * Awaited before navigating: `onboarded_at` is what stops `app/index.tsx`
   * sending the user back to the first question, so a failure that goes
   * unmentioned means the whole flow starts again on the next launch with
   * nothing to explain it. Both exits go through here for that reason.
   */
  const finish = async (destination: string) => {
    try {
      await completeOnboarding.mutateAsync()
      router.replace(destination)
    } catch (error) {
      toast.show({
        title: error instanceof Error ? error.message : t('common:action.retry'),
        tone: 'error',
      })
    }
  }

  return (
    <Screen
      scroll={false}
      contentClassName="justify-center"
      footer={
        <View className="gap-1.5">
          <Button
            fullWidth
            // A second tap while the first write is in flight completes
            // onboarding twice and races two `replace` calls.
            disabled={completeOnboarding.isPending}
            onPress={() => finish('/today')}
          >
            {t('target.logFirst')}
          </Button>
          <Button
            variant="ghost"
            fullWidth
            disabled={completeOnboarding.isPending}
            onPress={() => finish('/preview')}
          >
            {t('target.explore')}
          </Button>
        </View>
      }
    >
      {isPending ? (
        // Placeholders rather than zeroes. The ring, the headline and the three
        // tiles are all the same number, so rendering before it arrives says
        // "0 KCAL A DAY, about 2 meals" in full confidence and then corrects
        // itself a beat later.
        <View className="items-center gap-5">
          <Skeleton className="h-[186px] w-[186px]" />
          <Skeleton className="h-8 w-4/5" />
          <View className="w-full flex-row gap-2.5">
            <Skeleton className="h-[76px] flex-1" rounded={false} />
            <Skeleton className="h-[76px] flex-1" rounded={false} />
            <Skeleton className="h-[76px] flex-1" rounded={false} />
          </View>
        </View>
      ) : targets ? (
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

          <Text variant="screenTitle" className="text-center">
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
                  weight: Number(profile?.target_weight_kg ?? 0).toFixed(1),
                  date: format(reachedOn, 'd MMMM'),
                })
              : t('target.footnoteMaintain', { weight: current.toFixed(1) })}
          </Text>
        </View>
      ) : (
        // `current_daily_goals` is empty, so the trigger could not compute a
        // budget. The answers are saved and the app still works, so this says as
        // much and leaves both exits below reachable.
        <EmptyState
          title={t('target.noBudgetTitle')}
          description={t('target.noBudgetBody')}
          icon={{ set: 'body', name: 'target' }}
        />
      )}
    </Screen>
  )
}
