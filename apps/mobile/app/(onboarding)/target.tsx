import { format } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useSession } from '@/data'
import { useOnboardingDraft } from '@/features/onboarding'
import { computeTargets, goalDate } from '@/lib/nutrition'
import { Button, CalorieRing, Screen, StatTile, Text } from '@/ui'

/**
 * 07 YOUR TARGET
 *
 * The budget, worked out on the phone.
 *
 * Everywhere else in the app this number comes from `current_daily_goals`,
 * computed by a trigger and read back — but there is no row to read here, because
 * there is no account yet. `computeTargets` is the same arithmetic as
 * `compute_targets()` and exists for exactly this screen; the database's copy
 * takes over the moment the answers are flushed, and the two are kept in step on
 * purpose.
 *
 * Nothing on this screen waits for the network, which is the point of showing it
 * before asking for an email: the user sees what they get before being asked for
 * anything.
 */
export default function TargetStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { draft, patch } = useOnboardingDraft()
  const { session } = useSession()

  // Defaults that only matter if a screen was skipped, which the Continue gates
  // do not allow. Present so the arithmetic below cannot divide by nothing.
  const weightKg = draft.weightKg ?? 65
  const targetWeightKg = draft.targetWeightKg ?? weightKg
  const targets = computeTargets({
    sex: draft.sex ?? 'female',
    weightKg,
    heightCm: draft.heightCm ?? 164,
    age: draft.age ?? 29,
    activity: draft.activity ?? 'light',
    goal: draft.goal ?? 'track',
  })

  const reachedOn = goalDate(draft.goal ?? 'track', weightKg, targetWeightKg, new Date())

  // Roughly 600 kcal a meal is what a Malaysian plate runs to, so the budget
  // divided by that is the honest answer to "how much food is this?".
  const meals = Math.max(2, Math.round(targets.kcal / 600))

  /**
   * Records which way out was chosen, then asks for the account.
   *
   * The choice is made here but cannot be acted on until there is somewhere to
   * write the answers, and the account step sits in between — so it goes in the
   * draft and `finish` reads it back. A user who already has a session (signed
   * in, then answered the questions) skips straight to the flush.
   */
  const proceed = (exit: 'today' | 'preview') => {
    patch({ exit })
    if (session) {
      router.replace('/finish')
      return
    }
    router.push({ pathname: '/sign-in', params: { mode: 'sign-up' } })
  }

  return (
    <Screen
      scroll={false}
      contentClassName="justify-center"
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={() => proceed('today')}>
            {t('target.logFirst')}
          </Button>
          <Button variant="ghost" fullWidth onPress={() => proceed('preview')}>
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
                weight: targetWeightKg.toFixed(1),
                date: format(reachedOn, 'd MMMM'),
              })
            : t('target.footnoteMaintain', { weight: weightKg.toFixed(1) })}
        </Text>
      </View>
    </Screen>
  )
}
