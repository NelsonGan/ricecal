import { Image } from 'expo-image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import Animated, {
  cubicBezier,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { AVATAR_CANVAS, AVATAR_LAYERS } from './layers.generated'
import { type AvatarState, EATING_MS, eatingFrames, MOOD_LEAN, moodPose, type Pose } from './mood'
import { buildStack, type StackEntry } from './stack'
import type { Outfit } from './wardrobe'

const CW = AVATAR_CANVAS.width
const CH = AVATAR_CANVAS.height

/** Where the right arm turns from, on the canvas: the shoulder. */
const SHOULDER_R = { x: 305, y: 395 }

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

/** A slow breath, so the figure reads as resting rather than frozen. */
const BREATHE = { from: { transform: [{ scaleY: 1 }] }, to: { transform: [{ scaleY: 1.012 }] } }
/** Hungry sways a little on its feet. */
const SWAY = { from: { transform: [{ rotate: '-1deg' }] }, to: { transform: [{ rotate: '1deg' }] } }
/** Sparkles, rumbles and puffs drift. */
const DRIFT = {
  from: { opacity: 1, transform: [{ translateY: 0 }] },
  to: { opacity: 0.55, transform: [{ translateY: -5 }] },
}
const IN_OUT = cubicBezier(0.77, 0, 0.175, 1)

export type AvatarCrop = { x: number; y: number; w: number; h: number }

export type AvatarFigureProps = {
  outfit: Outfit
  state: AvatarState
  /** Rendered width in points; the height follows the canvas (or the crop). */
  width: number
  /** Called once when an action such as eating has finished playing. */
  onActionEnd?: () => void
  /**
   * Idle motion and cross-fades. Off for the customise screen's tiles, where a
   * dozen figures breathing at once would be noise and cost.
   */
  animated?: boolean
  /** A part of the canvas to show, for a tile that only needs the head or the feet. */
  crop?: AvatarCrop
  accessibilityLabel?: string
}

/**
 * The avatar: a stack of transparent drawings on one shared canvas (README:
 * The avatar on Today).
 *
 * Driven by a small state, a mood plus an optional one-off action, so the
 * screen only ever says what is true ("the day is nearly at its target", "a
 * meal just landed") and this decides what the face, the arms and the effects
 * do about it. Each layer is its own view over the whole canvas, so any of
 * them can be moved from a shared pivot later (a wave, a bigger eating
 * animation) without touching the drawings.
 */
export function AvatarFigure({
  outfit,
  state,
  width,
  onActionEnd,
  animated = true,
  crop,
  accessibilityLabel,
}: AvatarFigureProps) {
  const reduced = useReducedMotion()
  const motion = animated && !reduced
  const scale = width / (crop?.w ?? CW)
  const height = (crop?.h ?? CH) * scale
  const holding = outfit.held !== null

  const resting = useMemo(() => moodPose(state.mood, holding), [state.mood, holding])
  const [actionPose, setActionPose] = useState<Pose | null>(null)
  // The first frame of an action is drawn in the render that starts it, not a
  // timer later: a figure mounted to eat must never show the new mood first.
  const pose =
    actionPose ??
    (state.action === 'eating' ? (eatingFrames(state.mood, holding)[0]?.pose ?? resting) : resting)

  // The eating hand rises from below; chewing is a small squash of the figure.
  const lift = useSharedValue(0)
  const chew = useSharedValue(1)

  // `onActionEnd` is the caller's, and a new function each render.
  const ended = useRef(onActionEnd)
  ended.current = onActionEnd

  // Started by the action alone: the mood is read once, when the meal lands,
  // because it is already the day's new mood, and a mood that changes while
  // the spoon is up must not restart the bite.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (state.action !== 'eating') return
    const frames = eatingFrames(state.mood, holding)
    const timers = frames.map((frame) =>
      setTimeout(() => {
        setActionPose(frame.pose)
        lift.set(withTiming(frame.lift, { duration: 280, easing: EASE_OUT }))
        if (frame.chew) {
          chew.set(
            withRepeat(
              withSequence(
                withTiming(0.982, { duration: 130, easing: EASE_OUT }),
                withTiming(1, { duration: 130, easing: EASE_OUT }),
              ),
              2,
            ),
          )
        }
      }, frame.at),
    )
    timers.push(
      setTimeout(() => {
        setActionPose(null)
        ended.current?.()
      }, EATING_MS),
    )
    return () => {
      for (const timer of timers) clearTimeout(timer)
      setActionPose(null)
      lift.set(0)
      chew.set(1)
    }
  }, [state.action])

  const armStyle = useAnimatedStyle(() => {
    if (!motion) return {}
    const down = 1 - lift.get()
    return {
      transform: [{ translateY: down * 46 * scale }, { rotate: `${down * 18}deg` }],
    }
  })
  const chewStyle = useAnimatedStyle(() => (motion ? { transform: [{ scaleY: chew.get() }] } : {}))

  const stack = buildStack(outfit, pose)
  const lean = `${actionPose || state.action ? 0 : MOOD_LEAN[state.mood]}deg`

  return (
    <View
      style={{ width, height, overflow: 'hidden' }}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <View
        style={{
          position: 'absolute',
          left: -(crop?.x ?? 0) * scale,
          top: -(crop?.y ?? 0) * scale,
          width: CW * scale,
          height: CH * scale,
          // A full tummy leans back a touch, from the feet.
          transformOrigin: 'bottom',
          transform: [{ rotate: motion ? lean : '0deg' }],
        }}
      >
        <Animated.View
          style={[
            { flex: 1, transformOrigin: 'bottom' },
            motion && state.mood === 'hungry' && !actionPose
              ? {
                  animationName: SWAY,
                  animationDuration: '1800ms',
                  animationDirection: 'alternate',
                  animationIterationCount: 'infinite',
                  animationTimingFunction: IN_OUT,
                }
              : null,
          ]}
        >
          <Animated.View
            style={[
              { flex: 1, transformOrigin: 'bottom' },
              motion
                ? {
                    animationName: BREATHE,
                    animationDuration: '2600ms',
                    animationDirection: 'alternate',
                    animationIterationCount: 'infinite',
                    animationTimingFunction: IN_OUT,
                  }
                : null,
            ]}
          >
            <Animated.View style={[{ flex: 1, transformOrigin: 'bottom' }, chewStyle]}>
              {stack.map((entry) => (
                <Layer
                  key={entry.name}
                  entry={entry}
                  scale={scale}
                  motion={motion}
                  armStyle={entry.group === 'armR' ? armStyle : undefined}
                />
              ))}
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  )
}

function Layer({
  entry,
  scale,
  motion,
  armStyle,
}: {
  entry: StackEntry
  scale: number
  motion: boolean
  armStyle?: ReturnType<typeof useAnimatedStyle>
}) {
  const layer = AVATAR_LAYERS[entry.name]
  const clip = entry.clipTop ?? 0
  const image = (
    <Image
      source={layer.source}
      style={{
        position: 'absolute',
        left: layer.x * scale,
        top: (layer.y - clip) * scale,
        width: layer.w * scale,
        height: layer.h * scale,
      }}
      contentFit="fill"
      cachePolicy="memory"
      accessible={false}
    />
  )
  return (
    <Animated.View
      pointerEvents="none"
      // Swapping a face or an arm cross-fades rather than blinking.
      entering={motion ? FadeIn.duration(160) : undefined}
      exiting={motion ? FadeOut.duration(160) : undefined}
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: CW * scale,
          height: CH * scale,
          transformOrigin: [SHOULDER_R.x * scale, SHOULDER_R.y * scale, 0],
        },
        armStyle,
        entry.group === 'effect' && motion
          ? {
              animationName: DRIFT,
              animationDuration: '1400ms',
              animationDirection: 'alternate',
              animationIterationCount: 'infinite',
              animationTimingFunction: IN_OUT,
            }
          : null,
      ]}
    >
      {clip > 0 ? (
        // Hair under a hat: everything above the brim line is cut away.
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: clip * scale,
            width: CW * scale,
            height: (CH - clip) * scale,
            overflow: 'hidden',
          }}
        >
          {image}
        </View>
      ) : (
        image
      )}
    </Animated.View>
  )
}
