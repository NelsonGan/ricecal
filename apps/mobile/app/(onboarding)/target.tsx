import { format } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useSession } from '@/data'
import { stepNumber, TOTAL_STEPS, useOnboardingDraft } from '@/features/onboarding'
import { computeTargets, goalDate } from '@/lib/nutrition'
import { Button, CalorieRing, Screen, StatTile, StepProgress, Text } from '@/ui'

/**
 * 06 YOUR TARGET
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
  const { draft } = useOnboardingDraft()
  const { session } = useSession()

  // Defaults that only matter if a screen was skipped, which the Continue gates
  // do not allow. Present so the arithmetic below cannot divide by nothing.
  const weightKg = draft.weightKg ?? 65
  const targetWeightKg = draft.targetWeightKg ?? weightKg
  const body = {
    sex: draft.sex ?? 'female',
    weightKg,
    heightCm: draft.heightCm ?? 164,
    age: draft.age ?? 29,
    activity: draft.activity ?? 'light',
    // The gap between this and `weightKg` IS the plan, so it has to be here and
    // not only in the footnote below. `finish` writes it to the profile and the
    // trigger runs the same arithmetic against it — leaving it out is how this
    // screen would promise a budget the account then quietly disagrees with.
    targetWeightKg,
  }

  const targets = computeTargets(body)
  // From the same body as the budget, so the date and the number on the ring
  // cannot describe different plans.
  const reachedOn = goalDate(body, targetWeightKg, new Date())

  // Roughly 600 kcal a meal is what a Malaysian plate runs to, so the budget
  // divided by that is the honest answer to "how much food is this?".
  const meals = Math.max(2, Math.round(targets.kcal / 600))

  /**
   * On to the account, which is the next mark on the bar.
   *
   * A user who already has a session — signed in first, then answered the
   * questions — skips straight to the flush; there is nothing to ask them for.
   * The step and total ride along so the account screen can draw the same bar
   * rather than dropping it for one screen in the middle of the flow.
   */
  const accept = () => {
    if (session) {
      router.replace('/finish')
      return
    }
    router.push({
      pathname: '/sign-in',
      params: {
        mode: 'sign-up',
        step: String(stepNumber('account')),
        total: String(TOTAL_STEPS),
      },
    })
  }

  /**
   * Back to the first question rather than into an editor.
   *
   * Every answer is already in the draft, so walking the four screens again is
   * four taps with every choice made — and it is the only route that can change
   * this number, since the number IS those answers.
   *
   * `dismissTo`, and the choice is load-bearing. `about` is already on the stack
   * underneath this screen, so what is wanted is to UNWIND to it. `navigate`
   * looks like it would — the name suggests going to a route rather than adding
   * one — but in expo-router 57 it pushes unless the target is already the
   * current screen, which put a second `about` ON TOP of `target`: the back
   * swipe from "A few basics" then went FORWARD in time to the budget, and
   * walking the questions again stacked another four. `dismissTo` pops to the
   * href, and falls back to replacing this screen if it is not on the stack —
   * which is what a deep link straight to `target` would hit.
   */
  const revise = () => router.dismissTo('/(onboarding)/about')

  return (
    <Screen
      scroll={false}
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={accept}>
            {t('target.looksRight')}
          </Button>
          <Button variant="ghost" fullWidth onPress={revise}>
            {t('target.adjust')}
          </Button>
        </View>
      }
    >
      <StepProgress
        total={TOTAL_STEPS}
        current={stepNumber('target')}
        tone="pandan"
        accessibilityLabel={t('common:a11y.step', {
          current: stepNumber('target'),
          total: TOTAL_STEPS,
        })}
      />

      <View className="flex-1 items-center justify-center gap-5">
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
