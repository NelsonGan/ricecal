import { useEffect } from 'react'
import { TextInput, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { motion } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { useNumpadField } from './Numpad'
import { Tappable } from './Tappable'
import { Text } from './Text'

const fills = {
  pandan: 'bg-pandan',
  kaya: 'bg-kaya',
  hibiscus: 'bg-hibiscus',
  water: 'bg-water',
  teh: 'bg-teh',
} as const

export type ProgressTone = keyof typeof fills

export type ProgressBarProps = {
  /** 0–1. Values above 1 are clamped; the tone is how "over" is communicated. */
  value: number
  tone?: ProgressTone
  /** Track height in points. 22 for the headline bar, 12 for a macro. */
  height?: number
  /** Animate from empty on mount. Off for bars inside a list. */
  animateOnMount?: boolean
  accessibilityLabel?: string
  className?: string
}

/**
 * A rounded progress track.
 *
 * The fill animates via `width` rather than `scaleX` — a scaled bar squashes
 * its own rounded end cap, which is very visible at 22pt tall with a 999px
 * radius.
 */
export function ProgressBar({
  value,
  tone = 'pandan',
  height = 22,
  animateOnMount = true,
  accessibilityLabel,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, value))
  const progress = useSharedValue(animateOnMount ? 0 : clamped)

  useEffect(() => {
    progress.value = withTiming(clamped, {
      duration: motion.fill,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    })
  }, [clamped, progress])

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }))

  return (
    <View
      className={cn('overflow-hidden rounded-full bg-track', className)}
      style={{ height }}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Animated.View className={cn('h-full rounded-full', fills[tone])} style={fillStyle} />
    </View>
  )
}

export type MacroBarProps = {
  label: string
  /** Rendered as-is: "182g", "61 g", "1,204 kcal". */
  amount: string
  value: number
  tone?: ProgressTone
  /** Makes the amount tappable — for a figure the user is allowed to correct. */
  onPressAmount?: () => void
  /** What a screen reader says about that control, if not "<label> <amount>". */
  amountLabel?: string
  /**
   * Puts a caret in the amount instead of a number.
   *
   * The field IS the amount — same face, same size, same place, no box around
   * it — so the row does not change shape when it becomes editable and nothing
   * new appears anywhere else on the card. `editingValue` is what is typed so
   * far, empty meaning "still the figure shown".
   */
  editing?: boolean
  editingValue?: string
  onChangeAmount?: (value: string) => void
  onDoneAmount?: () => void
  className?: string
}

/**
 * A labelled macro row: name, amount, thin bar.
 *
 * Carbs are kaya, protein hibiscus, fat teh tarik. Those pairings are fixed
 * across the app, so callers pass the tone rather than the component guessing
 * from the label.
 *
 * No `flex-1` of its own. It used to carry one, which reads as "share the
 * space" and only means that in a row — three bars side by side. Stacked in a
 * column it means "take the leftover HEIGHT, starting from nothing", and a
 * column whose height is constrained then squeezes every bar to a few points
 * with its labels squashed out. A caller laying these out in a row asks for
 * `flex-1`; one stacking them says nothing and gets content height.
 */
export function MacroBar({
  label,
  amount,
  value,
  tone = 'kaya',
  onPressAmount,
  amountLabel,
  editing = false,
  editingValue = '',
  onChangeAmount,
  onDoneAmount,
  className,
}: MacroBarProps) {
  const colors = useThemeColors()

  // The macro's own name in the pad's header: three of these rows sit one under
  // another, and with the pad up the row being typed into is the only thing
  // distinguishing them that is still on screen.
  const numpad = useNumpadField({
    enabled: editing && Boolean(onChangeAmount),
    value: editingValue,
    onChangeText: onChangeAmount ?? (() => {}),
    label: amountLabel ?? label,
    replaceFirst: true,
    onBlur: onDoneAmount,
  })

  return (
    <View className={cn('gap-2', className)}>
      <View className="flex-row items-center justify-between">
        <Text variant="label">{label}</Text>
        {editing ? (
          // Typed in place. The input carries the same class list as the text
          // it replaces, so the only thing that changes on the row is that
          // there is a caret in it.
          <TextInput
            value={editingValue}
            onChangeText={onChangeAmount}
            onSubmitEditing={onDoneAmount}
            placeholder={amount}
            placeholderTextColor={colors.faint}
            keyboardType="decimal-pad"
            returnKeyType="done"
            autoFocus
            selectTextOnFocus
            accessibilityLabel={amountLabel ?? label}
            // No `leading-*`, and no padding. A native text field crops to its
            // line box where `Text` lets a tall glyph overflow, so a line
            // shorter than the font wants slices the type — which is what it
            // did to the calorie figure at display size. Less pronounced at
            // 15pt, and the same mistake.
            className="min-w-[64px] text-right font-body-black text-[15px] text-ink"
            style={{ paddingVertical: 0, paddingHorizontal: 0 }}
            cursorColor={colors.pandan}
            selectionColor={colors.pandan}
            {...numpad}
          />
        ) : onPressAmount ? (
          // The number itself is the control. A macro that can be corrected
          // should be corrected where it is read, not in a second form
          // underneath repeating all four figures back.
          <Tappable
            onPress={onPressAmount}
            accessibilityRole="button"
            accessibilityLabel={amountLabel ?? `${label} ${amount}`}
          >
            <Text variant="label" className="text-muted">
              {amount}
            </Text>
          </Tappable>
        ) : (
          <Text variant="label" className="text-muted">
            {amount}
          </Text>
        )}
      </View>
      <ProgressBar
        value={value}
        tone={tone}
        height={12}
        accessibilityLabel={`${label} ${amount}`}
      />
    </View>
  )
}
