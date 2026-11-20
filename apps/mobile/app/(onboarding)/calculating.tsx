import { Canvas, Path, Skia } from '@shopify/react-native-skia'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import {
  planBudget,
  StepHeader,
  stepNumber,
  TOTAL_STEPS,
  useOnboardingDraft,
} from '@/features/onboarding'
import { useThemeColors } from '@/theme/useTheme'
import { cn, Icon, Screen, Text } from '@/ui'

/**
 * A beat between the last question and the number.
 *
 * Nothing is computed here: `computeTargets` is arithmetic over five fields. This
 * screen exists because a budget that appears in the same frame as the tap reads
 * as a default rather than a result.
 *
 * So the three lines say what the number is made of, and the wait is the length
 * of reading them. Deliberately short: a fake progress bar that outlasts its own
 * explanation is the more annoying failure.
 *
 * A ring rather than a spinner, because this wait is not indefinite: three things
 * are being worked out and the screen knows which one it is on. The ring counts
 * up to the person's own daily budget, then draws the carbs, protein and fat
 * split inside it in the colours every macro bar in the app uses, so what the
 * animation shows is what the three lines say.
 *
 * `replace` rather than `push`: the back chevron from the target screen belongs
 * on the last question, and a screen that immediately advances is a trap.
 */

/**
 * The timeline, in milliseconds from mount. Each phase is what its line says:
 * the calorie figure counts up as the ring fills, the macro split draws itself
 * inside it, then the whole ring settles while "matching your food" lands.
 * About two and a half seconds, which is what the screen took before.
 */
/**
 * Held until the screen has slid in. Started on mount, the count ran under the
 * push transition and the first frame anybody saw already read 1,460 of 1,580.
 */
const START_MS = 350
const COUNT_MS = 1100
const SPLIT_MS = 800
const SETTLE_MS = 500
/** When each of the three lines ticks, and when the screen leaves. */
const TICKS = [
  START_MS + COUNT_MS,
  START_MS + COUNT_MS + SPLIT_MS,
  START_MS + COUNT_MS + SPLIT_MS + SETTLE_MS,
] as const
const LEAVE_MS = TICKS[2] + 450

const LINES = ['budget', 'macros', 'catalogue'] as const

const RING = 184
const THICKNESS = 14
/** The macro ring sits inside the calorie ring, thinner, with a hairline between. */
const INNER = 7
const INNER_GAP = 7
/** Degrees left empty between two macro segments, so three colours read as three. */
const SEGMENT_GAP = 7

/** The ease the count and the fill share, so the number and the ring arrive together. */
const easeOut = (x: number) => 1 - (1 - x) ** 3

export default function CalculatingStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const colors = useThemeColors()
  const reduceMotion = useReducedMotion()
  const { draft } = useOnboardingDraft()

  /**
   * The figure the next screen opens on. It used to count a percentage of
   * nothing in thirds (0, 33, 67, 100); counting up to the person's own budget
   * is the one thing this beat can show that a spinner cannot.
   */
  const budget = useMemo(() => planBudget(draft), [draft])

  /** How many lines are done. */
  const [done, setDone] = useState(0)
  /** The figure in the middle of the ring, counted on the JS thread. */
  const [shown, setShown] = useState(reduceMotion ? budget.kcal : 0)

  /**
   * Read through a ref, so the timeline is booked exactly once. With the router
   * in the effect's dependencies, a router that is a new object on a render
   * (a test's, at least) re-booked every timer on each frame of the count.
   */
  const routerRef = useRef(router)
  routerRef.current = router

  // The tally and the exit, booked once. Every timer is cleared on unmount, so
  // a screen that goes away early cannot navigate whatever replaced it.
  useEffect(() => {
    const timers = [
      ...TICKS.map((at, index) => setTimeout(() => setDone(index + 1), at)),
      setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      }, TICKS[2]),
      setTimeout(() => routerRef.current.replace('/(onboarding)/target'), LEAVE_MS),
    ]
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [])

  /**
   * The count. A frame loop rather than an animated text node, because the
   * figure is about thirty state updates over a second on a screen that draws
   * nothing else, and a plain `Text` keeps the app's own type and its
   * accessibility. Rounded to tens until the last frame, so the digits roll
   * rather than flicker.
   */
  useEffect(() => {
    if (reduceMotion) {
      setShown(budget.kcal)
      return
    }
    let frame = 0
    const started = Date.now() + START_MS
    const step = () => {
      const progress = Math.min(1, Math.max(0, (Date.now() - started) / COUNT_MS))
      const value = budget.kcal * easeOut(progress)
      setShown(progress < 1 ? Math.round(value / 10) * 10 : budget.kcal)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [budget.kcal, reduceMotion])

  /** The calorie ring's fill, on the UI thread, on the same curve as the count. */
  const fill = useSharedValue(reduceMotion ? 1 : 0)
  /** The macro split, 0 to 3: each whole number is one segment fully drawn. */
  const split = useSharedValue(reduceMotion ? 3 : 0)
  /** The settle: one soft breath of the whole ring when the last line lands. */
  const breath = useSharedValue(1)

  useEffect(() => {
    if (reduceMotion) return
    fill.value = withDelay(
      START_MS,
      withTiming(1, { duration: COUNT_MS, easing: Easing.out(Easing.cubic) }),
    )
    split.value = withDelay(
      START_MS + COUNT_MS,
      withTiming(3, { duration: SPLIT_MS, easing: Easing.inOut(Easing.quad) }),
    )
    breath.value = withDelay(
      TICKS[1],
      withSequence(
        withTiming(1.045, { duration: 220, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 9, stiffness: 160 }),
      ),
    )
  }, [fill, split, breath, reduceMotion])

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }))

  const outer = THICKNESS / 2
  const outerBox = { x: outer, y: outer, width: RING - THICKNESS, height: RING - THICKNESS }
  const inner = THICKNESS + INNER_GAP + INNER / 2
  const innerBox = { x: inner, y: inner, width: RING - inner * 2, height: RING - inner * 2 }

  const track = Skia.PathBuilder.Make().addArc(outerBox, 0, 360).detach()
  const innerTrack = Skia.PathBuilder.Make().addArc(innerBox, 0, 360).detach()

  // Rebuilt per frame on the UI thread, which keeps the fill off the JS thread.
  // A sweep of zero would draw a dot under the round cap, so it starts at a hair.
  const arc = useDerivedValue(() =>
    Skia.PathBuilder.Make()
      .addArc(outerBox, -90, Math.max(0.01, fill.value * 360))
      .detach(),
  )

  /**
   * The three macros as shares of the budget's energy, in the order and the
   * colours every macro bar in the app uses: carbs, protein, fat.
   */
  const segments = useMemo(() => {
    const energy = [budget.carbs * 4, budget.protein * 4, budget.fat * 9]
    const total = energy.reduce((sum, value) => sum + value, 0) || 1
    const usable = 360 - SEGMENT_GAP * 3
    let start = -90 + SEGMENT_GAP / 2
    return energy.map((value) => {
      const sweep = (value / total) * usable
      const segment = { start, sweep }
      start += sweep + SEGMENT_GAP
      return segment
    })
  }, [budget])

  const carbs = useSegment(innerBox, segments[0], 0, split)
  const protein = useSegment(innerBox, segments[1], 1, split)
  const fat = useSegment(innerBox, segments[2], 2, split)

  return (
    <Screen scroll={false}>
      <StepHeader step={stepNumber('calculating')} total={TOTAL_STEPS} tone="pandan" />

      <View className="flex-1 justify-center gap-9">
        <View className="items-center gap-5">
          <Animated.View
            style={[{ width: RING, height: RING }, ringStyle]}
            className="items-center justify-center"
          >
            <Canvas style={{ width: RING, height: RING }}>
              <Path path={track} style="stroke" strokeWidth={THICKNESS} color={colors.track} />
              <Path
                path={arc}
                style="stroke"
                strokeWidth={THICKNESS}
                strokeCap="round"
                color={colors.pandan}
              />
              <Path path={innerTrack} style="stroke" strokeWidth={INNER} color={colors.track} />
              <Path
                path={carbs}
                style="stroke"
                strokeWidth={INNER}
                strokeCap="round"
                color={colors.kaya}
              />
              <Path
                path={protein}
                style="stroke"
                strokeWidth={INNER}
                strokeCap="round"
                color={colors.hibiscus}
              />
              <Path
                path={fat}
                style="stroke"
                strokeWidth={INNER}
                strokeCap="round"
                color={colors.teh}
              />
            </Canvas>

            <View
              className="absolute items-center"
              accessible
              accessibilityLabel={`${budget.kcal.toLocaleString()} ${t('onboarding:target.perDay')}`}
            >
              <Text className="font-display text-[38px] leading-[44px] text-heading">
                {shown.toLocaleString()}
              </Text>
              <Text variant="overlineSm" className="text-muted">
                {t('onboarding:target.perDay')}
              </Text>
            </View>
          </Animated.View>

          <View className="items-center gap-1.5">
            <Text variant="title" className="text-center text-[26px] leading-[32px]">
              {t('onboarding:calculating.title')}
            </Text>
            <Text variant="meta" className="text-center text-[16px] leading-[22px]">
              {t('onboarding:calculating.subtitle')}
            </Text>
          </View>
        </View>

        <View className="gap-3.5">
          {LINES.map((line, index) => (
            <Line
              key={line}
              label={t(`onboarding:calculating.steps.${line}`)}
              done={index < done}
              index={index}
            />
          ))}
        </View>
      </View>
    </Screen>
  )
}

/**
 * One macro segment, drawn from nothing to its share once `split` reaches its
 * index. A sweep of zero is no path at all rather than a dot under the cap.
 */
function useSegment(
  box: { x: number; y: number; width: number; height: number },
  segment: { start: number; sweep: number },
  index: number,
  split: SharedValue<number>,
) {
  return useDerivedValue(() => {
    const drawn = Math.min(1, Math.max(0, split.value - index))
    const path = Skia.PathBuilder.Make()
    if (drawn > 0) path.addArc(box, segment.start, segment.sweep * drawn)
    return path.detach()
  })
}

/**
 * One line of the tally.
 *
 * The tick's box is the same size whether it holds a check or not, so the label
 * beside it does not shuffle sideways as each line lands — three lines settling
 * one after another is the whole of the animation, and it only reads as settling
 * if nothing else moves.
 *
 * The check ARRIVES rather than appears: a spring on scale, from nothing, which
 * is the one moment on this screen a user is looking at a specific spot. The row
 * itself fades in on a stagger so the three do not land as a block.
 */
function Line({ label, done, index }: { label: string; done: boolean; index: number }) {
  const pop = useSharedValue(0)

  useEffect(() => {
    // Held at nothing until the line lands, so a row that is not done yet is not
    // running a spring toward zero on every render.
    pop.value = done ? withSpring(1, { damping: 12, stiffness: 220 }) : 0
  }, [done, pop])

  const popStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: pop.value }],
  }))

  return (
    <Animated.View
      entering={FadeIn.delay(index * 90).duration(320)}
      className="flex-row items-center gap-3.5"
      accessible
      accessibilityState={{ busy: !done }}
    >
      <View
        className={cn(
          'h-9 w-9 items-center justify-center rounded-full border-2',
          done ? 'border-pandan bg-pandan-soft' : 'border-line bg-surface',
        )}
      >
        {done ? (
          <Animated.View style={popStyle}>
            <Icon set="ui" name="check" size={20} />
          </Animated.View>
        ) : (
          <Pulse />
        )}
      </View>
      <Text variant="bodyStrong" className={done ? undefined : 'text-muted'}>
        {label}
      </Text>
    </Animated.View>
  )
}

/**
 * The dot in a line that has not landed yet.
 *
 * Breathing rather than static, because an empty circle beside a line of text
 * reads as a checkbox somebody forgot to tick. The delay is per mount, so the
 * two outstanding lines are never in phase with each other.
 */
function Pulse() {
  const beat = useSharedValue(0.4)

  useEffect(() => {
    beat.value = withDelay(
      120,
      withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true),
    )
  }, [beat])

  const style = useAnimatedStyle(() => ({
    opacity: beat.value,
    transform: [{ scale: beat.value }],
  }))

  return <Animated.View className="h-2.5 w-2.5 rounded-full bg-line-strong" style={style} />
}
