import { format } from 'date-fns/format'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSession } from '@/data'
import {
  planBody,
  StepHeader,
  stepNumber,
  TOTAL_STEPS,
  useOnboardingDraft,
} from '@/features/onboarding'
import {
  BudgetEditor,
  type BudgetFields,
  budgetFields,
  isRecommended,
  readBudget,
} from '@/features/shared'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { computeTargets, goalDate } from '@/lib/nutrition'
import { ReplayMask } from '@/lib/replay-mask'
import { fromKg, UNIT_KEY, unitFor } from '@/lib/units'
import { Button, FormCard, FormRow, Screen, Text } from '@/ui'

/**
 * Your target: the budget, worked out on the phone.
 *
 * Everywhere else this number comes from `current_daily_goals`, computed by a
 * trigger and read back, but there is no row yet because there is no account.
 * `computeTargets` is the same arithmetic as `compute_targets()` and exists for
 * this screen; the database's copy takes over once the answers are flushed.
 *
 * Nothing here waits for the network, which is the point of showing it before
 * asking for an email.
 *
 * Two sentences came off it, both the app talking about itself: "that is about 3
 * meals and a snack" divided the budget by a made-up 600, and "we will nudge,
 * never nag" is a promise about notifications on a screen showing calories. What
 * is left is the number, what it is made of, and where it goes.
 */
export default function TargetStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { draft, patch } = useOnboardingDraft()
  const { session } = useSession()

  const body = planBody(draft)
  // The goal weight in the units chosen on setup, as the basics step showed it.
  const weightUnit = unitFor(draft.units ?? 'metric')
  const weightKg = body.weightKg
  const targetWeightKg = body.targetWeightKg ?? weightKg

  const recommended = computeTargets(body)
  // From the same body as the budget, so the date and the number on the ring
  // cannot describe different plans.
  const reachedOn = goalDate(body, targetWeightKg, new Date())

  /**
   * The four figures, as they are being typed.
   *
   * Seeded from the draft rather than from the recommendation, so walking back to
   * the questions and forward again shows what was typed here. `undefined` means
   * untouched, and untouched is what the formula says — which is also what makes
   * the ring above move as the calorie box is edited.
   *
   * A typed budget therefore SURVIVES a change to the body it was typed against,
   * unlike the goals screen, where editing the target weight clears it. That is
   * deliberate: there a slider moved, here somebody typed a number a moment ago,
   * and the recommendation for the new body is one tap away on the card itself.
   */
  const [fields, setFields] = useState<BudgetFields | undefined>(() =>
    draft.targets ? budgetFields(draft.targets) : undefined,
  )
  const shown = fields ?? budgetFields(recommended)

  /**
   * Written to the draft on every keystroke rather than on the way out.
   *
   * The screen after this is the ACCOUNT, which leaves the flow for `(auth)` and
   * may come back to `finish` rather than here — there is no unmount this could
   * hang off that is guaranteed to run before the flush. The draft is MMKV and
   * the write is a few bytes.
   *
   * Cleared back to `undefined` when the fields say what the formula does, so a
   * user who typed a number and pressed `Use recommended` leaves with an
   * automatic budget rather than a frozen copy of the same figures.
   */
  const edit = (next: BudgetFields) => {
    setFields(next)
    patch({ targets: isRecommended(next, recommended) ? undefined : readBudget(next, recommended) })
  }

  /**
   * On to the account, which is the next mark on the bar.
   *
   * A user who already has a session — signed in first, then answered the
   * questions — skips straight to the flush; there is nothing to ask them for.
   * The step and total ride along so the account screen can draw the same bar
   * rather than dropping it for one screen in the middle of the flow.
   */
  const accept = () => {
    // Tracked here rather than through `OnboardingStep`, which this screen does
    // not use — it draws its own bar around the ring. The step BEFORE it, the
    // calculating beat, is deliberately not tracked at all: it advances itself
    // on a timer, so its count could only ever equal the step before it.
    track('Onboarding Step Completed', { step: 'target', step_number: stepNumber('target') })
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
   * Back to the first question rather than into an editor. Every answer is in the
   * draft, so walking the three screens again is three taps, and it is the only
   * route that can change this number.
   *
   * `dismissTo`, because `about` is already on the stack underneath and what is
   * wanted is to unwind to it. `navigate` pushes in expo-router 57 unless the
   * target is the current screen, which put a second `about` on top of `target`,
   * so the back swipe went forward in time to the budget. `dismissTo` falls back
   * to replacing this screen when the href is not on the stack.
   */
  const revise = () => router.dismissTo('/(onboarding)/about')

  /**
   * The chevron goes to the LAST QUESTION, not to the screen before this one.
   *
   * The calculating beat replaced itself on the way here, so what is underneath
   * is `source` — and unwinding to it is what a back gesture would have done if
   * this flow still had one. `dismissTo` rather than `back()` for the same
   * reason `revise` uses it: a deep link straight to this route has nothing to
   * pop, and `back()` there is answered by whatever navigator is listening.
   */
  const goBack = () => router.dismissTo('/(onboarding)/source')

  return (
    <Screen
      header={
        <StepHeader
          step={stepNumber('target')}
          total={TOTAL_STEPS}
          tone="pandan"
          onBack={goBack}
          art={{ set: 'body', name: 'target' }}
          title={t('target.title')}
          subtitle={t('target.subtitle')}
        />
      }
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
      {/* Editable, and this is the first screen in the flow where a number the
          app worked out can be argued with. It used to be three read-only tiles
          under a ring, over a button reading "This looks right" and a second one
          that walked back to the questions — so the only way to change the
          protein was to change the body it was computed from.

          The figures ride in the draft, because there is still no account to put
          them in; `finish` writes them as a custom budget once there is. */}
      <BudgetEditor
        value={shown}
        onChange={edit}
        recommended={recommended}
        onReset={() => edit(budgetFields(recommended))}
        compact
      />

      {/* Where the plan is going, as two rows of the same card shape rather
          than two coloured tiles. A maintain plan has no date to reach, so the
          second row says what it is doing instead of showing a dash: "steady"
          is the answer, not a missing measurement. */}
      <FormCard>
        <FormRow
          label={t('target.goalWeight')}
          // Kept out of replays, like every weight.
          value={
            <ReplayMask>
              <Text variant="bodyStrong">
                {`${fromKg(targetWeightKg, weightUnit).toFixed(1)} ${t(UNIT_KEY[weightUnit])}`}
              </Text>
            </ReplayMask>
          }
        />
        <FormRow
          label={reachedOn ? t('target.goalBy') : t('target.maintain')}
          value={
            reachedOn ? format(reachedOn, datePattern('dayMonthYear')) : t('target.maintainValue')
          }
        />
      </FormCard>
    </Screen>
  )
}
