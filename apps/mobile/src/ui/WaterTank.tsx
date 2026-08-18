import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
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

import { useThemeColors } from '@/theme/useTheme'
import { Skeleton } from './Skeleton'

export type WaterTankProps = {
  /** How much is in the tank. Any unit — the caller does the arithmetic. */
  value: number
  /** A full tank. */
  goal: number
  /** The level is not known yet: holds the tank's size and waits. */
  loading?: boolean
  /** Short by design. See the note below on why this is a tank and not a glass. */
  height?: number
  /** Corner radius. Match the card's own when the tank IS the card. */
  radius?: number
  /** Names the level to a screen reader. Pass translated copy. */
  accessibilityLabel?: string
  /**
   * Drawn over the tank, TWICE: once on the dry ground and once inside the
   * water, so a figure written across it stays legible whatever the level.
   *
   * A render prop rather than plain children because the two copies are not the
   * same pixels — the caller is told which ground it is drawing on and picks the
   * colour (`text-water-ink` on the dry part, `text-on-water` in the wet). One
   * colour cannot do both: in dark mode the water and the water ink are the
   * same value, so a figure that reads on the empty tank vanishes as it fills.
   */
  children?: (onWater: boolean) => ReactNode
  className?: string
}

/** How far a wave rides above and below the level it describes, in points. */
const AMPLITUDE = 3

/** Points between samples of the wave. Small enough that `lineTo` reads as a curve. */
const STEP = 4

/**
 * One full trip of each wave, in milliseconds. Slow: this is water, not a
 * loading bar.
 *
 * TWO PERIODS RATHER THAN ONE PHASE AND TWO SPEEDS, and that is a bug fix
 * rather than a preference. A phase that ramps 0 to 1 and repeats is only
 * seamless if the wave built from it advances a WHOLE cycle over that ramp —
 * multiply it by 0.62 to slow one wave down and the wrap leaves 38% of a cycle
 * unaccounted for, so every 3.6 seconds that wave jumped backwards. It read as
 * the animation resetting, because it was.
 *
 * Each wave gets its own value looping over its own duration instead, so both
 * advance exactly one cycle per wrap. The difference between the two durations
 * is what makes them beat against each other, which is what the second wave is
 * for.
 */
const PERIOD = 3600
const BACK_PERIOD = 5800

/** How far the surface tips, end to end, at the height of a slosh. In points. */
const TILT = 7

/** The outline's weight. See `outline` for why the path it follows is inset. */
const STROKE = 2

/** How much dry tank is left above the water on a day that met its goal. */
const BRIM = 2

/**
 * Water left in an empty tank, in points.
 *
 * A tank with NOTHING in it read as a component that had failed to load rather
 * than as a day nobody had drunk on — an outlined box with a figure in the
 * corner. A shallow puddle says "this holds water and there is none in it yet",
 * which is the same fact drawn as a state rather than as an absence.
 *
 * It does mean a day at zero and a day at one mouthful draw alike. That is the
 * figure's job, and the figure is right there: nothing here claims a quantity.
 */
const EMPTY_FILL = 5

/**
 * A day's water, as a tank of it.
 *
 * WIDE AND SHORT, which is the whole design. It was a tall glass beside a
 * column of buttons, and between them they took a third of the screen on the
 * one card that is not about food — on a diary whose subject is the meals
 * underneath. A tank is the same reading in a band, and on Today it IS the
 * card: pass it the card's own `radius` and let it fill, and what a user sees
 * is one object filling up rather than a chart sitting in a box.
 *
 * The surface does two things. It carries two waves at different speeds, which
 * is what makes it read as liquid rather than as a moving graph — one sine is a
 * chart, two crossing is a surface. And it TIPS, left and right, when the card
 * first appears and again whenever water is added: a tank that has just been
 * poured into sloshes and settles, and that half second is the difference
 * between a picture of water and a progress bar that happens to be blue.
 *
 * The level springs rather than eases, for the same reason.
 *
 * The wave never stops while this is mounted, which is a deliberate cost: it is
 * two paths of about sixty points rebuilt per frame on the UI thread, and it
 * buys the one thing a static fill cannot say, which is that this is a liquid.
 */
/**
 * Where the surface sits, in points from the top of the tank.
 *
 * ONE FORMULA, called from two places: the waves are drawn around it on the UI
 * thread, and the overlay's wet copy is clipped to it. Written twice they
 * drifted — the clip used a plain fraction of the height, which ignores both
 * the puddle at the bottom and the brim at the top, so the figure's colours
 * changed a few points before or after the water actually reached them.
 *
 * A worklet, because one of its two callers is.
 */
function surfaceTop(height: number, level: number) {
  'worklet'
  const floor = height - EMPTY_FILL
  return floor - (floor - BRIM) * level
}

export function WaterTank({
  value,
  goal,
  loading = false,
  height = 56,
  radius,
  accessibilityLabel,
  children,
  className,
}: WaterTankProps) {
  const colors = useThemeColors()
  const reduceMotion = useReducedMotion()

  // Skia needs a pixel size and this fills whatever it is put in, so the width
  // is measured rather than passed. Nothing draws until it is known — one frame
  // of an empty band, inside a card that is already laid out, so nothing moves.
  const [width, setWidth] = useState(0)
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)

  const filled = goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0

  // Primitives and shared values only, and pulled out of every object before a
  // worklet can see one: a worklet FREEZES what it closes over, and a frozen
  // shared value stops accepting writes without saying so.
  const level = useSharedValue(0)
  const phase = useSharedValue(0)
  const phaseBack = useSharedValue(0)
  const tilt = useSharedValue(0)

  useEffect(() => {
    level.value = withSpring(filled, { damping: 14, stiffness: 90, mass: 0.9 })
  }, [filled, level])

  // The slosh: on the first draw, and again on every change of level. Delayed a
  // beat on mount so it starts as the card settles rather than under the
  // navigation animation, where nobody is looking at it yet.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `filled` is the trigger, not a read — a new level is a new pour
  useEffect(() => {
    if (reduceMotion) return
    tilt.value = withDelay(
      120,
      withSequence(
        withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
        withRepeat(withTiming(-1, { duration: 620, easing: Easing.inOut(Easing.sin) }), 3, true),
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.sin) }),
      ),
    )
    // Settles the surface, which also cancels the sequence: two and a half
    // seconds of slosh outliving the screen it was on is work nobody sees.
    return () => {
      tilt.value = 0
    }
  }, [filled, tilt, reduceMotion])

  useEffect(() => {
    if (reduceMotion) return
    // Linear, and it must be: any easing on a loop makes the wave hesitate once
    // a cycle, which reads as a dropped frame rather than as a current.
    const loop = (duration: number) =>
      withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false)
    phase.value = loop(PERIOD)
    phaseBack.value = loop(BACK_PERIOD)
    return () => {
      phase.value = 0
      phaseBack.value = 0
    }
  }, [phase, phaseBack, reduceMotion])

  const corner = radius ?? Math.min(14, height / 3)

  // The tank at its full size: what the ground is painted with, and what the
  // water is clipped to. Flush with the canvas on every side, so nothing of the
  // card behind it shows through at the edge.
  const tank = Skia.PathBuilder.Make()
    .addRRect({ rect: { x: 0, y: 0, width, height }, rx: corner, ry: corner })
    .detach()

  /**
   * The outline, drawn on a path pulled IN by half its own width.
   *
   * A stroke straddles the path it follows, so an outline on the full-size
   * tank puts half its weight outside the canvas, where it is clipped away —
   * and the bottom edge loses a little more again to the card's own rounded
   * clip underneath. What that left was a border that was solid along the top
   * and the sides and a washed-out hairline along the bottom. Inset by half,
   * the whole stroke lands inside the canvas and the four edges match.
   *
   * Inset by a WHOLE stroke width and the border would sit a point clear of the
   * canvas edge, which shows the card through the gap — the white line this was
   * meant to remove, one point further in.
   */
  const outline = Skia.PathBuilder.Make()
    .addRRect({
      rect: {
        x: STROKE / 2,
        y: STROKE / 2,
        // Clamped: `width` is 0 until the first layout, and a rounded rect two
        // points wide in the wrong direction is not something to hand Skia.
        width: Math.max(0, width - STROKE),
        height: Math.max(0, height - STROKE),
      },
      rx: Math.max(0, corner - STROKE / 2),
      ry: Math.max(0, corner - STROKE / 2),
    })
    .detach()

  // Two surfaces. The back one is slower and taller, so the pair beat against
  // each other rather than travelling as one thick line.
  const back = useWavePath({
    width,
    height,
    level,
    phase: phaseBack,
    tilt,
    offset: 0.5,
    scale: 1.3,
  })
  const front = useWavePath({ width, height, level, phase, tilt, offset: 0, scale: 1 })

  // How much of the overlay is under water, off the SAME formula the waves are
  // drawn around. A number and a shared value are all this worklet captures:
  // see the note on `useWavePath` for why that matters.
  const wetClip = useAnimatedStyle(() => ({ height: height - surfaceTop(height, level.value) }))

  if (loading) {
    // The tank's own corner, not `Skeleton`'s pill and not a literal: this is
    // drawn at the card's radius on Today and at its own everywhere else, so
    // the placeholder is exactly the shape of the thing it stands in for and
    // nothing changes silhouette when the day arrives. A wrapper because the
    // radius is a number rather than a class.
    return (
      <View className={className} style={{ height, borderRadius: corner, overflow: 'hidden' }}>
        <Skeleton height={height} rounded={false} className="w-full" />
      </View>
    )
  }

  return (
    <View className={className} style={{ height }} onLayout={onLayout}>
      {/* The label sits on the DRAWING rather than on the box, because the box
          now has children: `accessible` on a container collapses everything
          under it on iOS, which would swallow the Add button drawn over the
          water. */}
      <View
        accessible={Boolean(accessibilityLabel)}
        accessibilityRole={accessibilityLabel ? 'progressbar' : undefined}
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: 0, max: goal, now: Math.round(value) }}
      >
        {width > 0 ? (
          <Canvas style={{ width, height }}>
            {/* The empty tank, then the water clipped to it, then the outline
                over both so the water never covers it. */}
            <Path path={tank} color={colors.waterSoft} />
            <Group clip={tank}>
              <Path path={back} color={colors.waterSoftLine} />
              <Path path={front} color={colors.water} />
            </Group>
            <Path path={outline} style="stroke" strokeWidth={STROKE} color={colors.waterSoftLine} />
          </Canvas>
        ) : null}
      </View>

      {children ? (
        <>
          {/* The dry copy, and the only one anything can touch or announce. */}
          <View style={StyleSheet.absoluteFill}>{children(false)}</View>

          {/* The wet copy: the same content again, in the water's own colours,
              inside a box that is exactly as tall as the water and clips. Laid
              out from the BOTTOM of a full-height child, so the two copies land
              on the same pixels without a second animated value to keep in step.

              Its edge is the MEAN level, where the water it stands in has a wave
              on it — so a figure being crossed by the surface is out by a couple
              of points for the moment it takes to pass. Following the crest
              would mean clipping to the Skia path, which React Native views
              cannot do; the alternative was leaving the figure to disappear into
              the water entirely. */}
          <Animated.View
            style={[styles.wet, wetClip]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
              {children(true)}
            </View>
          </Animated.View>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wet: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
})

/**
 * One moving surface, as a path rebuilt per frame on the UI thread.
 *
 * The three shared values are passed rather than closed over from a context or
 * a ref holder, and that is not a style choice: a worklet FREEZES every object
 * reachable from what it captures, so a wave reading its level out of an object
 * that owns one would quietly stop the level ever moving again. Primitives and
 * shared values only.
 */
function useWavePath({
  width,
  height,
  level,
  phase,
  tilt,
  offset,
  scale,
}: {
  width: number
  height: number
  level: SharedValue<number>
  /** This wave's OWN loop, so a wrap is always a whole cycle. See `PERIOD`. */
  phase: SharedValue<number>
  tilt: SharedValue<number>
  offset: number
  scale: number
}) {
  return useDerivedValue(() => {
    // Neither end of the range is the edge of the tank: an empty day keeps a
    // shallow puddle and a full one keeps a brim of dry tank, because a level
    // flush with the rim stops reading as a level at all. See `surfaceTop`.
    const amplitude = AMPLITUDE * scale
    const top = surfaceTop(height, level.value)
    const builder = Skia.PathBuilder.Make()

    for (let x = 0; x <= width; x += STEP) {
      const across = width > 0 ? x / width : 0
      // The slosh tips the whole surface rather than adding a wave of its own:
      // water in a tank that has just been knocked rides up one end and down
      // the other, and it is the two ends disagreeing that reads as weight. A
      // second sine would only read as a faster current.
      const tipped = top + tilt.value * TILT * (across - 0.5)
      const angle = across * Math.PI * 2 * 1.6 + (phase.value + offset) * Math.PI * 2
      const y = tipped + Math.sin(angle) * amplitude
      if (x === 0) builder.moveTo(x, y)
      else builder.lineTo(x, y)
    }

    return builder.lineTo(width, height).lineTo(0, height).close().detach()
  })
}
