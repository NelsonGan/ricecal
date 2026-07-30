import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Button, type ButtonVariant, Screen, StepProgress, type StepProgressTone, Text } from '@/ui'

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
  /** 1-based. Drives the progress bar. */
  step: number
  total: number
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
  step,
  total,
  accent,
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
}: OnboardingStepProps) {
  const { t } = useTranslation('common')

  return (
    <Screen
      footer={
        <View className="gap-1.5">
          <Button
            variant={accentButton[accent]}
            fullWidth
            onPress={onPrimary}
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
      {/* Announced rather than shown: the design leaves the marks to speak for
          themselves, and a screen reader has nothing to go on but a percentage. */}
      <StepProgress
        total={total}
        current={step}
        tone={accent}
        accessibilityLabel={t('a11y.step', { current: step, total })}
      />

      <View className="gap-2 pt-4">
        <Text variant="title">{title}</Text>
        {subtitle ? <Text className="text-[16px] leading-[24px]">{subtitle}</Text> : null}
      </View>

      <View className="gap-md pt-2">{children}</View>
    </Screen>
  )
}
