import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import type { SuggestRequest } from '@/data'
import { Icon, Skeleton, Text } from '@/ui'
import { PICK_COUNT } from './ask'

/**
 * One key per skeleton row, minted once.
 *
 * The rows are identical and never reorder, so the index IS a stable identity —
 * but a list keyed by index is a shape worth not having in the codebase at all,
 * and a frozen array of names costs nothing.
 */
const SKELETON_ROWS = Array.from({ length: PICK_COUNT }, (_, row) => `pick-${row}`)

/** How long the shuttle takes to cross the track once. */
const SWEEP_MS = 1100
/** And the sparkle's own rise and fall. Slower, so the two do not beat. */
const FLOAT_MS = 1600

/**
 * A bar that says WORK IS HAPPENING rather than how much is done.
 *
 * One model call takes between five and fifteen seconds and nothing on this
 * side knows where in that it is, so a determinate bar would be a number made
 * up — and a bar parked at 66% for ten seconds reads as a bar that has stopped.
 * A shuttle crossing the track says the same thing honestly and keeps moving
 * for as long as the wait lasts.
 *
 * `translateX` on a fixed-width child rather than an animated `width`, because
 * a transform runs on the UI thread and a width does not: the layout pass a
 * width animation costs every frame is exactly what a JS thread busy parsing a
 * model's answer cannot afford, and the bar would stutter at the moment it is
 * meant to be reassuring.
 */
function Shuttle() {
  const travel = useSharedValue(0)

  useEffect(() => {
    travel.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.cubic) }),
      -1,
      // Reversed rather than restarted: a shuttle that jumps back to the left
      // reads as a bar that failed and began again.
      true,
    )
  }, [travel])

  // The track is measured in percentages, so the shuttle's travel is too: it is
  // 35% wide and moves across the remaining 65%.
  const style = useAnimatedStyle(() => ({ left: `${travel.value * 65}%` }))

  return (
    <View className="h-[9px] overflow-hidden rounded-full bg-track">
      <Animated.View className="h-full w-[35%] rounded-full bg-pandan" style={style} />
    </View>
  )
}

/**
 * The sparkle, breathing.
 *
 * The same idea as the shuttle at a different speed: something on screen has to
 * be alive for the length of a wait nobody can predict, and two things moving
 * at once is livelier than one without being busy.
 */
function Sparkle() {
  const lift = useSharedValue(0)

  useEffect(() => {
    lift.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: FLOAT_MS / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: FLOAT_MS / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    )
  }, [lift])

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }))

  return (
    <Animated.View
      className="h-[52px] w-[52px] items-center justify-center rounded-tile bg-pandan-soft"
      style={style}
    >
      <Icon set="system" name="sparkle" size={28} />
    </Animated.View>
  )
}

export type ThinkingProps = {
  /** Null only for the instant before the first request has been recorded. */
  request: SuggestRequest | null
  /** What was asked for, in one line. The picks sheet's own summary. */
  summary?: React.ReactNode
}

/**
 * L8 THINKING: the wait, with the question still on screen.
 *
 * The question is repeated deliberately. The sheet that asked it has closed and
 * ten seconds is long enough to stop being sure what was asked.
 *
 * ONE SKELETON ROW PER PICK COMING, not a token three, and each the height of a
 * real one — this stands in for exactly what is on its way, in a panel that must
 * not change height when the answer arrives. Which is why the count comes from
 * `PICK_COUNT` rather than from a literal: the two moved apart once already,
 * when the list went from five to seven.
 */
export function Thinking({ request, summary }: ThinkingProps) {
  const { t } = useTranslation('suggest')

  return (
    <View className="gap-md">
      <View className="flex-row items-center gap-3">
        <Sparkle />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="bodyStrong">
            {t('picks.thinking', { meal: request ? t(`mealFor.${request.meal}`) : '' })}
          </Text>
          {summary}
        </View>
      </View>

      <View accessibilityRole="progressbar" accessibilityLabel={t('picks.thinkingA11y')}>
        <Shuttle />
      </View>

      <View className="gap-2">
        {SKELETON_ROWS.map((row) => (
          // `height` as a prop rather than a class: `Skeleton` puts its own
          // height in an inline style, which wins over anything NativeWind
          // compiles — passed as `h-[72px]` these drew as 14pt pills.
          <Skeleton key={row} height={72} rounded={false} className="rounded-tile" />
        ))}
      </View>
    </View>
  )
}
