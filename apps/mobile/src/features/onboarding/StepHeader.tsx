import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useKeyboardState } from 'react-native-keyboard-controller'

import { useThemeColors } from '@/theme/useTheme'
import {
  cn,
  Icon,
  IconButton,
  type IconProps,
  StepProgress,
  type StepProgressTone,
  Text,
  useNumpadOpen,
} from '@/ui'
import { ONBOARDING_ART, type OnboardingArtName } from './art'

/**
 * The small drawing over a step's heading: one of the design system's icons, or
 * one of the pictures drawn for this flow.
 */
export type StepArt = IconProps | { art: OnboardingArtName }

/** 48: a picture over the heading, small enough that the answers start high on the screen. */
const ART_SIZE = 48

export type StepHeaderProps = {
  /** 1-based, matching `stepNumber()`. */
  step: number
  total: number
  tone?: StepProgressTone
  /** Omitted on a screen with nothing behind it, which draws the bar alone. */
  onBack?: () => void
  /** The question this progress row belongs to, fixed beneath it. */
  title?: string
  subtitle?: string
  /** Drawn above the title, at the leading edge. Every step in the flow has one. */
  art?: StepArt
  className?: string
}

/**
 * The chevron and the progress bar, on one row. The flow has no edge swipe any
 * more, so it needs a visible way back: the gesture was turned off in
 * `(onboarding)/_layout.tsx` because half the flow replaces rather than pushes,
 * and a swipe walked a minute-old account back into a question from before the
 * account existed.
 *
 * A row rather than a bar above the marks, because the two both answer "where am
 * I", and stacked they cost vertical space on the steps with the most to fit.
 */
export function StepHeader({
  step,
  total,
  tone = 'pandan',
  onBack,
  title,
  subtitle,
  art,
  className,
}: StepHeaderProps) {
  const { t } = useTranslation('common')
  const colors = useThemeColors()

  /**
   * While somebody is typing, the header keeps only the bar and the question.
   * It is pinned above the scroll area, and with the drawing and a three-line
   * subtitle (the password step's names the address) it left so little room
   * over the keyboard that the second field sat under the button.
   */
  const keyboardUp = useKeyboardState((state) => state.isVisible)
  const padUp = useNumpadOpen()
  const typing = keyboardUp || padUp

  return (
    <View className={cn(title && 'gap-stack', className)}>
      <View className="flex-row items-center gap-3">
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
          variant="bar"
          total={total}
          current={step}
          tone={tone}
          accessibilityLabel={t('a11y.step', { current: step, total })}
        />
      </View>

      {title ? (
        <View className="gap-1.5 pt-3">
          {art && !typing ? (
            <View className="pb-1">
              {'art' in art ? (
                <Image
                  source={ONBOARDING_ART[art.art]}
                  style={{ width: ART_SIZE, height: ART_SIZE }}
                  contentFit="contain"
                  transition={0}
                />
              ) : (
                <Icon {...art} size={ART_SIZE} />
              )}
            </View>
          ) : null}
          <Text variant="title" className="text-[26px] leading-[32px]">
            {title}
          </Text>
          {subtitle && !typing ? (
            <Text variant="meta" className="text-[16px] leading-[22px]">
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
