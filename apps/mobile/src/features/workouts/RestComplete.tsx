import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccessibilityInfo, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { useThemeColors } from '@/theme/useTheme'
import { Icon, Text } from '@/ui'

/** How long the card stays before it goes by itself. */
const SHOWN_MS = 1500

type Listener = () => void
const listeners = new Set<Listener>()

/**
 * Said by `useWorkoutEffects` when a rest runs out with the app in front, the
 * same moment as its haptic. The logger is what listens; with it closed the
 * haptic is the whole notice.
 */
export function announceRestComplete(): void {
  for (const listener of listeners) listener()
}

/** A fresh number each time a rest ends while `active`, or 0 before the first. */
export function useRestComplete(active: boolean): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!active) return
    const listener = () => setCount((n) => n + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [active])
  return count
}

/**
 * "Rest complete", over the logger for a moment and gone by itself.
 *
 * It takes no touches, so a thumb already on its way to the next set's tick
 * lands on the set rather than on a card about to close: the notice is to be
 * glanced at, and a gym is not the place for one more button. Keyed by the
 * caller on each rest, so a second rest ending replays it.
 */
export function RestCompleteCard({ next, onDone }: { next: string | null; onDone: () => void }) {
  const { t } = useTranslation('workouts')
  const colors = useThemeColors()
  const still = useReducedMotion()

  const done = useRef(onDone)
  done.current = onDone
  const spoken = next
    ? `${t('rest.complete')}. ${t('rest.next', { name: next })}`
    : t('rest.complete')
  const label = useRef(spoken)
  const pop = useSharedValue(still ? 1 : 0.6)
  const ring = useSharedValue(0)
  const left = useSharedValue(1)

  useEffect(() => {
    // The card takes no touches, so a screen reader would never reach it; it
    // is said instead, on both platforms.
    AccessibilityInfo.announceForAccessibility(label.current)
    if (!still) {
      pop.value = withSpring(1, { damping: 11, stiffness: 220, mass: 0.7 })
      ring.value = withDelay(60, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }))
    }
    left.value = withTiming(0, { duration: SHOWN_MS, easing: Easing.linear })
    const timer = setTimeout(() => done.current(), SHOWN_MS)
    return () => clearTimeout(timer)
  }, [still, pop, ring, left])

  const badge = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }))
  const wave = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - ring.value),
    transform: [{ scale: 0.92 + ring.value * 0.36 }],
  }))
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: 0.8 + pop.value * 0.2 }] }))
  const bar = useAnimatedStyle(() => ({ width: `${left.value * 100}%` }))

  return (
    <Animated.View
      entering={FadeIn.duration(140)}
      exiting={FadeOut.duration(180)}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      className="items-center justify-center bg-black/20 px-10"
      accessibilityLabel={spoken}
    >
      <View className="w-full max-w-[300px] items-center overflow-hidden rounded-card bg-surface px-6 pt-8 pb-9">
        <View className="h-[104px] w-[104px] items-center justify-center">
          <Animated.View
            style={[wave, { borderColor: colors.pandan }]}
            className="absolute h-[104px] w-[104px] rounded-full border-2"
          />
          <Animated.View
            style={halo}
            className="absolute h-[96px] w-[96px] rounded-full bg-pandan-soft"
          />
          <Animated.View
            style={badge}
            className="h-[68px] w-[68px] items-center justify-center rounded-full bg-pandan"
          >
            <Icon set="ui" name="check" size={34} tintColor={colors.onPandan} />
          </Animated.View>
        </View>
        <Text variant="subtitle" className="mt-3 text-center">
          {t('rest.complete')}
        </Text>
        {next ? (
          <Text variant="meta" className="mt-1 text-center" numberOfLines={2}>
            {t('rest.next', { name: next })}
          </Text>
        ) : null}
        {/* How long it has left, so a card that goes by itself does not
            look like one that broke. */}
        <View className="absolute right-7 bottom-4 left-7 h-[3px] overflow-hidden rounded-full bg-pandan-soft">
          <Animated.View style={bar} className="h-full rounded-full bg-pandan" />
        </View>
      </View>
    </Animated.View>
  )
}
