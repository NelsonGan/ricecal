import { Canvas, Path, Skia } from '@shopify/react-native-skia'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { StepHeader, stepNumber, TOTAL_STEPS } from '@/features/onboarding'
import { useThemeColors } from '@/theme/useTheme'
import { cn, Icon, Screen, Text } from '@/ui'

/**
 * 05 CALCULATING
 *
 * A beat between the last question and the number.
 *
 * Nothing is computed here — `computeTargets` on the next screen is arithmetic
 * over five fields and returns in well under a millisecond. This screen exists
 * because the answer arriving instantly reads as a default rather than as a
 * result: the user gives their height, their weight, their target and how they
 * spend their day, and a budget that appears in the same frame as the tap looks
 * like it was in the app before they got there.
 *
 * So the three lines are honest about what the number is made of — the budget,
 * the split, the catalogue it will be spent against — and the wait is the length
 * of reading them. It is deliberately short: a fake progress bar that outlasts
 * its own explanation is the other failure mode, and it is the more annoying one.
 *
 * WHY THE RING RATHER THAN A SPINNER
 *
 * A spinner says "waiting" and nothing else, and this wait is not indefinite:
 * there are exactly three things being worked out and the screen knows which one
 * it is on. So the ring fills to the tally rather than turning for its own sake,
 * and the sweep on top of it is the only part that says "still going". The
 * shape is also the shape of the answer — the next screen opens on a calorie
 * ring — so the two screens read as one thought rather than as a loader and a
 * result.
 *
 * `replace`, not `push`. The back chevron from the target screen belongs on the
 * last QUESTION; a screen that immediately advances again is a trap you cannot
 * walk out of backwards.
 */

/** How long each line holds before the next one starts. */
const TICK_MS = 700

/** The pause after the last tick, so the final check is seen and not merely drawn. */
const SETTLE_MS = 450

const LINES = ['budget', 'macros', 'catalogue'] as const

const RING = 172
const THICKNESS = 14
/** How much of the circle the sweep covers. Short enough to read as a pointer. */
const SWEEP_DEGREES = 68

export default function CalculatingStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const colors = useThemeColors()

  /** How many lines are done. Counts past the last one, which is the cue to leave. */
  const [done, setDone] = useState(0)

  useEffect(() => {
    // One timer at a time rather than an interval, so the last gap can be
    // longer than the others and the cleanup has exactly one handle to clear.
    const timer = setTimeout(
      () => {
        if (done < LINES.length) {
          setDone((count) => count + 1)
          return
        }
        router.replace('/(onboarding)/target')
      },
      done < LINES.length ? TICK_MS : SETTLE_MS,
    )

    return () => clearTimeout(timer)
  }, [done, router])

  const inset = THICKNESS / 2
  const box = { x: inset, y: inset, width: RING - THICKNESS, height: RING - THICKNESS }

  /**
   * The fill, driven by the tally rather than by a clock.
   *
   * It travels a third of the ring per line and eases in, so the motion between
   * two steps is longer than the gap that produced it — the ring is still
   * moving when the next line lands, which is what stops three ticks 700ms
   * apart reading as three separate stutters.
   */
  const filled = useSharedValue(0)
  useEffect(() => {
    filled.value = withTiming(done / LINES.length, {
      duration: 620,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    })
  }, [done, filled])

  /** The one part that turns for its own sake: proof the screen is alive. */
  const spin = useSharedValue(0)
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.linear }), -1, false)
  }, [spin])

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }))

  const track = Skia.PathBuilder.Make().addArc(box, 0, 360).detach()
  const sweep = Skia.PathBuilder.Make().addArc(box, -90, SWEEP_DEGREES).detach()

  // Rebuilt per frame on the UI thread, which keeps the fill off the JS thread.
  const arc = useDerivedValue(() =>
    Skia.PathBuilder.Make()
      .addArc(box, -90, filled.value * 360)
      .detach(),
  )

  const percent = Math.round((done / LINES.length) * 100)

  return (
    <Screen scroll={false}>
      <StepHeader step={stepNumber('calculating')} total={TOTAL_STEPS} tone="pandan" />

      <View className="flex-1 justify-center gap-9">
        <View className="items-center gap-5">
          <View style={{ width: RING, height: RING }} className="items-center justify-center">
            <Canvas style={{ width: RING, height: RING }}>
              <Path path={track} style="stroke" strokeWidth={THICKNESS} color={colors.track} />
              <Path
                path={arc}
                style="stroke"
                strokeWidth={THICKNESS}
                strokeCap="round"
                color={colors.pandan}
              />
            </Canvas>

            {/* A second canvas on top rather than a third path in the first
                one: the sweep is the only thing rotating, and rotating the
                whole canvas would take the fill with it. */}
            <Animated.View
              style={[{ position: 'absolute', width: RING, height: RING }, spinStyle]}
              pointerEvents="none"
            >
              <Canvas style={{ width: RING, height: RING }}>
                <Path
                  path={sweep}
                  style="stroke"
                  strokeWidth={THICKNESS}
                  strokeCap="round"
                  color={colors.kaya}
                  opacity={0.9}
                />
              </Canvas>
            </Animated.View>

            <View className="absolute items-center">
              <Text className="font-display text-[40px] leading-[46px] text-heading">
                {percent}
              </Text>
              <Text variant="overlineSm" className="text-muted">
                %
              </Text>
            </View>
          </View>

          <Text variant="title" className="text-center">
            {t('onboarding:calculating.title')}
          </Text>
          <Text className="text-center text-[16px] leading-[24px]">
            {t('onboarding:calculating.subtitle')}
          </Text>
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
