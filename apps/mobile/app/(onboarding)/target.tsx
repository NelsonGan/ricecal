import { format } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSession } from '@/data'
import { StepHeader, stepNumber, TOTAL_STEPS, useOnboardingDraft } from '@/features/onboarding'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { computeTargets, goalDate } from '@/lib/nutrition'
import type { StatTileTone } from '@/ui'
import { Button, CalorieRing, Card, Icon, type IconProps, Screen, StatTile, Text } from '@/ui'

/**
 * The three macros, in the app's own colours.
 *
 * Kaya, hibiscus, teh — the same triple as `MacroBars` on Today, the entry
 * screen and the weekly report. This screen is the FIRST place a user meets
 * them, so getting it wrong here would teach the colour and then contradict it
 * on the next screen. That is what the `teh` tone in `StatTile` is for; before
 * it, fat had no soft surface anywhere in the system.
 */
const MACROS = [
  { key: 'carbs', tone: 'kaya', icon: { set: 'food', name: 'carb-block' } },
  { key: 'protein', tone: 'hibiscus', icon: { set: 'food', name: 'protein-block' } },
  { key: 'fat', tone: 'teh', icon: { set: 'food', name: 'fat-block' } },
] as const satisfies ReadonlyArray<{ key: string; tone: StatTileTone; icon: IconProps }>

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
 *
 * WHAT WAS TAKEN OFF IT
 *
 * Two sentences, and both were the app talking about itself rather than about
 * the plan. "That is about 3 meals and a snack" divided the budget by a made-up
 * 600 and presented the quotient as advice; "We will nudge, never nag" is a
 * promise about notifications on a screen showing a calorie figure. What is left
 * is the number, what it is made of, and where it goes — the goal weight and the
 * date it lands on, as tiles rather than as prose, because they are figures and
 * a figure reads faster in a tile than in a sentence.
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

  const grams = { carbs: targets.carbs, protein: targets.protein, fat: targets.fat }

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
   * Back to the first question rather than into an editor.
   *
   * Every answer is already in the draft, so walking the three screens again is
   * three taps with every choice made — and it is the only route that can change
   * this number, since the number IS those answers.
   *
   * `dismissTo`, and the choice is load-bearing. `about` is already on the stack
   * underneath this screen, so what is wanted is to UNWIND to it. `navigate`
   * looks like it would — the name suggests going to a route rather than adding
   * one — but in expo-router 57 it pushes unless the target is already the
   * current screen, which put a second `about` ON TOP of `target`: the back
   * swipe from "A few basics" then went FORWARD in time to the budget, and
   * walking the questions again stacked another three. `dismissTo` pops to the
   * href, and falls back to replacing this screen if it is not on the stack —
   * which is what a deep link straight to `target` would hit.
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
      <StepHeader step={stepNumber('target')} total={TOTAL_STEPS} tone="pandan" onBack={goBack} />

      <View className="items-center gap-2 pt-2">
        <CalorieRing
          value={targets.kcal}
          goal={targets.kcal}
          /**
           * 156 AND A THINNER STROKE, because at the default 196 this screen
           * did not fit.
           *
           * The ring, the split card and the two plan tiles ran past the CTA on
           * a 6.3" phone: "GOAL WEIGHT" and "ON TRACK FOR" sat behind the
           * footer until you scrolled, so the two figures the plan is FOR were
           * the ones you had to go looking for. Forty points off the ring and
           * five off its stroke buys 37, and dropping the card's heading buys
           * another 28: there is 65 points of clear space under the tiles now.
           *
           * IT STILL SCROLLS ON AN SE, and the ring is not why. Measured there,
           * the content still runs 74 points past the CTA — take the ring out
           * altogether and it would only just fit. What is left is five tall
           * `StatTile`s at about 123 points each, so the fix for a 4.7" screen
           * is a slimmer tile or fewer of them, not a smaller circle.
           *
           * It reads quieter too, which is right for what it is. A full ring is
           * the whole budget rather than progress through one, so it has
           * nothing to animate and no state to report — it is a number in a
           * circle, and the number is the part worth looking at. The centre
           * label scales with the ring, so it stays the biggest thing here.
           */
          size={156}
          thickness={16}
          // A full ring here is the plan, not a day gone over, so the automatic
          // "you are at 100%" kaya would say the wrong thing.
          tone="pandan"
          centerLabel={targets.kcal.toLocaleString()}
          centerCaption={t('target.perDay')}
        />
        <Text variant="screenTitle" className="text-center">
          {t('target.title')}
        </Text>
      </View>

      {/* No card title. It read "YOUR DAILY SPLIT" over three tiles labelled
          CARBS, PROTEIN and FAT, which is the same thing said twice: the tiles
          ARE the split, and nothing else on the screen could be mistaken for
          it. Dropping the heading also buys back the height the ring above it
          was asked to give up. */}
      <Card>
        <View className="flex-row gap-2.5">
          {MACROS.map((macro) => (
            <StatTile
              key={macro.key}
              className="flex-1"
              tone={macro.tone}
              icon={<Icon {...macro.icon} size={26} />}
              label={t(`target.${macro.key}`)}
              value={t('common:unit.grams', { value: grams[macro.key] })}
            />
          ))}
        </View>
      </Card>

      {/* Where the plan is going, as two figures rather than a sentence.
          A maintain plan has no date to reach, so the second tile says what it
          is doing instead of showing a dash — "steady" is the answer, not a
          missing measurement. */}
      <View className="flex-row gap-2.5">
        <StatTile
          className="flex-1"
          tone="pandan"
          icon={<Icon set="body" name="target" size={26} />}
          label={t('target.goalWeight')}
          value={`${targetWeightKg.toFixed(1)} ${t('common:unit.kg')}`}
        />
        <StatTile
          className="flex-1"
          tone="water"
          // Two elements rather than one with computed props: `IconProps` is a
          // mapped union, so a `set` and a `name` chosen by separate ternaries
          // widen to "any set, any name" and stop being checked against each
          // other.
          icon={
            reachedOn ? (
              <Icon set="system" name="calendar" size={26} />
            ) : (
              <Icon set="body" name="plateau" size={26} />
            )
          }
          label={reachedOn ? t('target.goalBy') : t('target.maintain')}
          value={
            reachedOn ? format(reachedOn, datePattern('dayMonthYear')) : t('target.maintainValue')
          }
        />
      </View>
    </Screen>
  )
}
