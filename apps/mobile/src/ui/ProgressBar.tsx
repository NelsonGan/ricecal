import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { motion } from '@/theme/tokens'
import { cn } from './cn'
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
  className?: string
}

// NO EDITING HERE ANY MORE. The amount used to be tappable and to swap itself
// for a caret in the same place, for the one screen where these figures are the
// user's to correct — a logged entry. It read beautifully and formed a bad form:
// one figure at a time, nothing to say which of the four had already been
// changed, and the number pad covering the two bars whose labels were the only
// thing distinguishing the row being typed into. Those figures are edited in
// `NutritionSheet` now, four labelled fields at once, and this component is back
// to being a reading of something already decided.

/**
 * A labelled macro row: name, amount, thin bar.
 *
 * Carbs are kaya, protein hibiscus, fat teh tarik. Those pairings are fixed
 * across the app, so callers pass the tone rather than the component guessing.
 *
 * No `flex-1` of its own. It used to carry one, which only means "share the
 * space" in a row; stacked in a column it means "take the leftover height", and a
 * column with a constrained height then squeezes every bar to a few points. A
 * caller laying these out in a row asks for `flex-1`.
 */
export function MacroBar({ label, amount, value, tone = 'kaya', className }: MacroBarProps) {
  return (
    <View className={cn('gap-2', className)}>
      <View className="flex-row items-center justify-between">
        <Text variant="label">{label}</Text>
        <Text variant="label" className="text-muted">
          {amount}
        </Text>
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
