import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { cn, Icon, IconButton, StepProgress, type StepProgressTone } from '@/ui'

export type StepHeaderProps = {
  /** 1-based, matching `stepNumber()`. */
  step: number
  total: number
  tone?: StepProgressTone
  /** Omitted on a screen with nothing behind it, which draws the bar alone. */
  onBack?: () => void
  className?: string
}

/**
 * The chevron and the progress bar, on one row.
 *
 * THE FLOW HAS NO EDGE SWIPE ANY MORE, so it needs a visible way back.
 *
 * The gesture was turned off in `(onboarding)/_layout.tsx` because half of this
 * flow REPLACES rather than pushes: after the account, the screen underneath
 * the health step is still a question from before the account existed,
 * and a swipe walked a minute-old account back into "Where did you hear about
 * us?". Turning it off for the questions too is what makes the rule one rule —
 * onboarding moves forwards, and backwards only where this chevron says so.
 *
 * A row rather than a bar above the marks: the two belong together (both answer
 * "where am I"), and stacked they cost a screen of vertical space on the steps
 * that already have the most to fit.
 */
export function StepHeader({ step, total, tone = 'pandan', onBack, className }: StepHeaderProps) {
  const { t } = useTranslation('common')
  const colors = useThemeColors()

  return (
    <View className={cn('flex-row items-center gap-3', className)}>
      {onBack ? (
        // The same control `AppBar` draws, deliberately: a 44pt bordered
        // square with a tinted chevron in it. As a ghost it was a dark
        // illustration floating on the canvas with nothing to say it was a
        // button, which is exactly the affordance this flow just lost when
        // the edge swipe went.
        <IconButton size="sm" onPress={onBack} accessibilityLabel={t('a11y.back')}>
          {/* Tinted, the same as `AppBar`'s. These icons are flat colour
              illustrations carrying their own palette, and untinted the
              chevron drew as a pink glyph in the corner of a green flow —
              chrome is monochrome. */}
          <Icon set="ui" name="chevron-left" size={20} tintColor={colors.muted} />
        </IconButton>
      ) : null}

      <StepProgress
        className="flex-1"
        total={total}
        current={step}
        tone={tone}
        accessibilityLabel={t('a11y.step', { current: step, total })}
      />
    </View>
  )
}
