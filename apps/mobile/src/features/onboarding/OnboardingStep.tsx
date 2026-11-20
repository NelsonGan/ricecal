import type { ReactNode } from 'react'
import { View } from 'react-native'

import { track } from '@/lib/analytics'
import { Button, Screen } from '@/ui'
import { type StepArt, StepHeader } from './StepHeader'
import { type OnboardingStepName, stepNumber, TOTAL_STEPS } from './steps'

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
  title: string
  subtitle?: string
  /** The small drawing over the heading. */
  art?: StepArt
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
 * One colour, pandan, on every step. The steps used to rotate four accents,
 * which read as several apps rather than one flow.
 *
 * `Screen`'s footer keeps the CTA above the keyboard, which matters on the two
 * steps that have a text field.
 */
export function OnboardingStep({
  name,
  title,
  subtitle,
  art,
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
   * The whole funnel, from one place. Fired here rather than in each screen's
   * handler because six screens are six chances to forget, and the seventh added
   * would silently end the funnel. The event is the CTA being pressed, not the
   * screen being rendered: a step somebody scrolled through and abandoned is what
   * a funnel is read to find.
   *
   * The secondary action is not tracked. It is a skip, and it lands on the same
   * next screen, so the two events would differ only in which button was pressed.
   */
  const advance = () => {
    track('Onboarding Step Completed', { step: name, step_number: step })
    onPrimary()
  }

  return (
    <Screen
      header={
        /* The progress and the question stay together while the answers
           scroll. A back control that remains reachable without the title it
           belongs to is only half a header. */
        <StepHeader
          step={step}
          total={TOTAL_STEPS}
          tone="pandan"
          onBack={onBack}
          title={title}
          subtitle={subtitle}
          art={art}
        />
      }
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={advance} disabled={primaryDisabled}>
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
      <View className="gap-md pt-2">{children}</View>
    </Screen>
  )
}
