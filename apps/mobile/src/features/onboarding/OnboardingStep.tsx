import type { ReactNode } from 'react'
import { View } from 'react-native'

import { track } from '@/lib/analytics'
import { Button, type ButtonVariant, Screen, type StepProgressTone, Text } from '@/ui'
import { StepHeader } from './StepHeader'
import { type OnboardingStepName, stepNumber, TOTAL_STEPS } from './steps'

/**
 * The accent each step wears, rotating pandan, kaya, water, hibiscus.
 *
 * The same four names the progress bar takes, so a step's colour is declared
 * once and reaches both the bar and the CTA.
 */
export type Accent = StepProgressTone

const accentButton: Record<Accent, ButtonVariant> = {
  pandan: 'primary',
  kaya: 'kaya',
  water: 'water',
  hibiscus: 'danger',
}

export type OnboardingStepProps = {
  /**
   * WHICH question this is, not what number it is.
   *
   * The position on the bar is derived from `ONBOARDING_STEPS` and so is the
   * total, for the reason written out in `steps.ts`: a number written per
   * screen lasts exactly until a screen is inserted. Passing the name rather
   * than the number extends that to the analytics funnel as well — the step a
   * user dropped at is the name they saw, and a funnel keyed on positions
   * renumbers itself the day a question is added.
   */
  name: OnboardingStepName
  accent: Accent
  title: string
  subtitle?: string
  children: ReactNode
  primaryLabel: string
  onPrimary: () => void
  primaryDisabled?: boolean
  /** The quiet second action under the CTA. */
  secondaryLabel?: string
  onSecondary?: () => void
  /**
   * The chevron beside the progress bar. Omitted where there is nothing behind
   * this screen worth returning to — the two permissions after the account, which
   * replaced their predecessor and would otherwise walk back into a question.
   */
  onBack?: () => void
}

/**
 * The frame every onboarding question shares: progress, heading, body, CTA.
 *
 * The accent is a prop rather than derived from `step` so a screen that is
 * reachable out of order — Create account after Explore first, say — still
 * carries the colour the design gives it.
 *
 * `Screen`'s footer keeps the CTA above the keyboard, which matters on the two
 * steps that have a text field.
 */
export function OnboardingStep({
  name,
  accent,
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  onBack,
}: OnboardingStepProps) {
  const step = stepNumber(name)

  /**
   * The whole funnel, from one place.
   *
   * Fired here rather than in each screen's own handler because six screens
   * would be six chances to forget, and the seventh screen added would be the
   * one that silently ends the funnel. The event is the CTA being pressed, not
   * the screen being rendered: a step somebody scrolled through and abandoned
   * is exactly the step a funnel is being read to find.
   *
   * The secondary action is deliberately not tracked. It is a skip or a "not
   * now", and it lands on the same next screen — so what would distinguish the
   * two events is a fact about which button, not about how far anybody got.
   */
  const advance = () => {
    track('Onboarding Step Completed', { step: name, step_number: step })
    onPrimary()
  }

  return (
    <Screen
      footer={
        <View className="gap-1.5">
          <Button
            variant={accentButton[accent]}
            fullWidth
            onPress={advance}
            disabled={primaryDisabled}
          >
            {primaryLabel}
          </Button>
          {secondaryLabel && onSecondary ? (
            <Button variant="ghost" fullWidth onPress={onSecondary}>
              {secondaryLabel}
            </Button>
          ) : null}
        </View>
      }
    >
      {/* The bar is announced rather than captioned: the design leaves the
          marks to speak for themselves, and a screen reader has nothing to go
          on but a percentage. */}
      <StepHeader step={step} total={TOTAL_STEPS} tone={accent} onBack={onBack} />

      <View className="gap-2 pt-4">
        <Text variant="title">{title}</Text>
        {subtitle ? <Text className="text-[16px] leading-[24px]">{subtitle}</Text> : null}
      </View>

      <View className="gap-md pt-2">{children}</View>
    </Screen>
  )
}
