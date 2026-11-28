import {
  Canvas,
  Group,
  Image,
  rect,
  type SkImage,
  type Transforms3d,
} from '@shopify/react-native-skia'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { View } from 'react-native'
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  type SharedValue,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { preloadAvatarLayers, useAvatarImages } from './images'
import { AVATAR_LAYERS, type AvatarLayerName } from './layers.generated'
import { type AvatarMood, type AvatarState, MOODS, moodPose } from './mood'
import { BLEED, type Bone, CANVAS, PIVOT } from './rig'
import { buildStack, type StackEntry } from './stack'
import {
  ACTIONS,
  IDLE_MS,
  idle,
  MOOD_LEAN,
  type Motion,
  REST,
  sample,
  windowOpacity,
} from './timeline'
import type { Outfit } from './wardrobe'

/** How far past its drawn pose the eating arm rises, in canvas units: drawn, it stops at the chin. */
const RAISE = 14
/** The eating arm's resting drop and turn, from its drawn pose at the mouth. */
const ARM_DROP = 46
const ARM_TURN = 18

const rad = (deg: number) => {
  'worklet'
  return (deg * Math.PI) / 180
}

export type AvatarCrop = { x: number; y: number; w: number; h: number }

export type AvatarFigureProps = {
  outfit: Outfit
  state: AvatarState
  /** Rendered width in points; the height follows the canvas (or the crop). */
  width: number
  /**
   * Called once when an action such as eating has finished playing. A figure
   * given one keeps the action's drawings mounted, ready to play at once.
   */
  onActionEnd?: () => void
  /**
   * Idle motion. Off for still pictures such as the customise screen's tiles,
   * where a dozen figures breathing at once would be noise.
   */
  animated?: boolean
  /** 0 to 1: where in its idle loop this figure starts, so a crowd does not breathe in step. */
  phase?: number
  /** A part of the canvas to show, for a tile that only needs the head or the feet. */
  crop?: AvatarCrop
  accessibilityLabel?: string
}

type Layer = StackEntry & {
  /** Shown while no motion plays: part of the resting pose. */
  rest: boolean
  /** When the motion shows it, as `[from, to)` on its clock. */
  windows: [number, number][]
}

/**
 * Every drawing a motion shows, in draw order, with when each is on. A drawing
 * shown in two touching segments gets one window, so it never re-fades.
 */
function motionStack(outfit: Outfit, motion: Motion, rest: StackEntry[] = []): Layer[] {
  const byName = new Map<AvatarLayerName, Layer & { order: number }>()
  let order = 0
  for (const entry of rest)
    byName.set(entry.name, { ...entry, rest: true, windows: [], order: order++ })
  motion.segments.forEach((segment, index) => {
    const to = motion.segments[index + 1]?.from ?? Number.POSITIVE_INFINITY
    for (const entry of buildStack(outfit, segment.pose)) {
      const known = byName.get(entry.name)
      if (!known) {
        byName.set(entry.name, {
          ...entry,
          rest: false,
          order: order++,
          windows: [[segment.from, to]],
        })
        continue
      }
      const last = known.windows.at(-1)
      if (last && last[1] === segment.from) last[1] = to
      else known.windows.push([segment.from, to])
    }
  })
  return [...byName.values()].sort((a, b) => a.z - b.z || a.order - b.order)
}

/** The motion ending on its mood with what the figure holds now, which can change mid-motion. */
function withEnding(motion: Motion, holding: boolean): Motion {
  const last = motion.segments.at(-1)
  if (!last) return motion
  return {
    ...motion,
    segments: [...motion.segments.slice(0, -1), { ...last, pose: moodPose(motion.mood, holding) }],
  }
}

/**
 * Decodes what this outfit needs to rest in `mood` and to eat, ahead of the
 * figure being shown, so a bite is never waiting on a file.
 */
export function preloadAvatar(outfit: Outfit, mood: AvatarMood): void {
  const holding = outfit.held !== null
  const rest = buildStack(outfit, moodPose(mood, holding))
  // A meal can end on any mood, so every mood's face and arms come too.
  const eat = MOODS.flatMap((next) => motionStack(outfit, ACTIONS.eating(next, holding)))
  preloadAvatarLayers(new Set([...rest, ...eat].map((layer) => layer.name)))
}

/**
 * The avatar: transparent drawings on one shared canvas, drawn by Skia and
 * moved by a three-bone rig (README: The avatar on Today, *How it moves*).
 *
 * Driven by a small state, a mood plus an optional one-off action, so a screen
 * only says what is true ("nearly at the target", "a meal just landed") and
 * this decides what the figure does about it. Every frame of motion is
 * computed on the UI thread from two clocks (the action's and an endless idle
 * loop), so a busy JavaScript thread never stutters it and React does not
 * re-render while it plays.
 */
export function AvatarFigure({
  outfit,
  state,
  width,
  onActionEnd,
  animated = true,
  phase = 0,
  crop,
  accessibilityLabel,
}: AvatarFigureProps) {
  const reduced = useReducedMotion()
  const moving = animated && !reduced
  const holding = outfit.held !== null
  const canAct = onActionEnd !== undefined

  // The action's motion is fixed when it starts: the mood it ends on is the
  // day's mood at the moment the meal landed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: started by the action alone
  const motion = useMemo(
    () => (state.action ? ACTIONS[state.action](state.mood, holding) : null),
    [state.action],
  )
  // The resting pose and every drawing eating would show, always mounted
  // together: starting a bite then changes only opacities on the UI thread.
  // Swapping the drawing tree when the meal landed took long enough on the
  // JavaScript side that the resting face lingered a beat after the spoon
  // should have been up.
  const layers: Layer[] = useMemo(() => {
    // A figure that can act (it has an `onActionEnd`) keeps them mounted even
    // while still or hidden; a picture such as a wardrobe tile never acts.
    const play = motion ?? (canAct ? ACTIONS.eating(state.mood, holding) : null)
    const rest = buildStack(outfit, moodPose(state.mood, holding))
    if (!play) return rest.map((entry) => ({ ...entry, rest: true, windows: [] }))
    return motionStack(outfit, withEnding(play, holding), rest)
  }, [motion, canAct, outfit, state.mood, holding])
  const names = useMemo(() => layers.map((layer) => layer.name), [layers])
  const images = useAvatarImages(names)

  // The eating drawings are decoded while the figure rests, so the first bite
  // does not wait on a file.
  useEffect(() => {
    if (animated) preloadAvatar(outfit, state.mood)
  }, [animated, outfit, state.mood])

  const clock = useSharedValue(-1)
  const idleClock = useSharedValue(0)

  useEffect(() => {
    if (!moving) return
    idleClock.set(0)
    idleClock.set(withRepeat(withTiming(IDLE_MS, { duration: IDLE_MS, easing: Easing.linear }), -1))
    // Stopped when the figure stops moving (off screen, reduce motion), so a
    // hidden figure does not redraw its canvas every frame.
    return () => cancelAnimation(idleClock)
  }, [moving, idleClock])

  const ended = useRef(onActionEnd)
  ended.current = onActionEnd
  const finish = useCallback(() => ended.current?.(), [])

  const ready = images !== null
  useEffect(() => {
    if (!motion || !ready) return
    clock.set(0)
    clock.set(
      withTiming(
        motion.duration,
        // The clock always runs: with reduce motion on the poses still
        // change, and only the transforms stand still (`moving`).
        { duration: motion.duration, easing: Easing.linear, reduceMotion: ReduceMotion.Never },
        (done) => {
          if (done) scheduleOnRN(finish)
        },
      ),
    )
    return () => clock.set(-1)
  }, [motion, ready, clock, finish])

  const mood: AvatarMood = state.mood
  const lift = useChannel(motion, clock, 'lift')
  const headRotate = useChannel(motion, clock, 'headRotate')
  const headY = useChannel(motion, clock, 'headY')
  const headSquash = useChannel(motion, clock, 'headSquash')
  const bodySquash = useChannel(motion, clock, 'bodySquash')
  const bodyY = useChannel(motion, clock, 'bodyY')
  const lean = useChannel(motion, clock, 'lean')

  const idleNow = useDerivedValue(
    () => idle(idleClock.get() + phase * IDLE_MS, mood),
    [mood, phase],
  )

  const rootT = useDerivedValue((): Transforms3d => {
    if (!moving) return []
    const still = idleNow.get()
    const squash = bodySquash.get() * still.bodySquash
    return [
      { translateY: bodyY.get() },
      { rotate: rad(MOOD_LEAN[mood] * lean.get() + still.sway) },
      { scaleX: 1 + (1 - squash) * 0.7 },
      { scaleY: squash },
    ]
  }, [moving, mood])
  const headT = useDerivedValue((): Transforms3d => {
    if (!moving) return []
    const still = idleNow.get()
    const squash = headSquash.get()
    return [
      { translateY: headY.get() + still.headY },
      { rotate: rad(headRotate.get() + still.headRotate) },
      { scaleX: 1 + (1 - squash) * 0.8 },
      { scaleY: squash },
    ]
  }, [moving])
  const armT = useDerivedValue((): Transforms3d => {
    const up = moving ? lift.get() : 1
    const down = 1 - up
    return [
      { translateY: down * ARM_DROP - Math.max(0, up) * RAISE },
      { rotate: rad(down * ARM_TURN) },
    ]
  }, [moving])
  const fxT = useDerivedValue(
    (): Transforms3d => (moving ? [{ translateY: idleNow.get().fxY }] : []),
    [moving],
  )
  const fxOpacity = useDerivedValue(() => (moving ? idleNow.get().fxOpacity : 1), [moving])

  const box = crop ?? { x: 0, y: 0, w: CANVAS.width, h: CANVAS.height }
  const scale = width / box.w
  const height = box.h * scale
  // A whole figure draws into a slightly larger surface than its box, so a
  // leaning hat or a drifting sparkle is never cut off. A crop is a picture
  // of one part and is clipped to its tile.
  const pad = crop ? 0 : Math.round(width * BLEED)

  const bones: Record<
    Bone,
    { transform?: SharedValue<Transforms3d>; origin?: { x: number; y: number } }
  > = {
    root: {},
    head: { transform: headT, origin: PIVOT.neck },
    armR: { transform: armT, origin: PIVOT.shoulderR },
    fx: { transform: fxT },
  }

  return (
    <View
      style={{ width, height }}
      pointerEvents="none"
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {images ? (
        <Canvas
          style={{
            position: 'absolute',
            left: -pad,
            top: -pad,
            width: width + 2 * pad,
            height: height + 2 * pad,
          }}
        >
          <Group
            transform={[
              { translateX: pad - box.x * scale },
              { translateY: pad - box.y * scale },
              { scale },
            ]}
          >
            <Group transform={rootT} origin={PIVOT.feet}>
              {layers.map((layer) => (
                <LayerImage
                  key={layer.name}
                  layer={layer}
                  image={images.get(layer.name)}
                  bone={bones[layer.bone]}
                  clock={clock}
                  playing={motion !== null}
                  fade={layer.bone === 'fx' ? fxOpacity : undefined}
                />
              ))}
            </Group>
          </Group>
        </Canvas>
      ) : null}
    </View>
  )
}

/** One channel of the playing motion, sampled on the UI thread; its rest value when idle. */
function useChannel(motion: Motion | null, clock: SharedValue<number>, name: keyof typeof REST) {
  return useDerivedValue(() => {
    if (!motion) return REST[name]
    return sample(motion.channels[name], Math.max(0, clock.get()), REST[name])
  }, [motion])
}

function LayerImage({
  layer,
  image,
  bone,
  clock,
  playing,
  fade,
}: {
  layer: Layer
  image: SkImage | undefined
  bone: { transform?: SharedValue<Transforms3d>; origin?: { x: number; y: number } }
  clock: SharedValue<number>
  playing: boolean
  fade?: SharedValue<number>
}) {
  const { windows, rest } = layer
  const opacity = useDerivedValue(() => {
    // The clock is below zero while no motion plays. Once one is asked for,
    // its first frame shows straight away, before the clock has started, so
    // the day's new mood never shows ahead of the spoon.
    const t = playing ? Math.max(0, clock.get()) : clock.get()
    const shown = t < 0 ? (rest ? 1 : 0) : windowOpacity(t, windows)
    return shown * (fade ? fade.get() : 1)
  }, [windows, rest, playing])
  if (!image) return null
  const place = AVATAR_LAYERS[layer.name]
  const drawing = (
    <Image
      image={image}
      x={place.x}
      y={place.y}
      width={place.w}
      height={place.h}
      opacity={opacity}
    />
  )
  const clipped =
    layer.clipTop !== undefined ? (
      // Hair under a hat: everything above the brim line is cut away.
      <Group clip={rect(0, layer.clipTop, CANVAS.width, CANVAS.height - layer.clipTop)}>
        {drawing}
      </Group>
    ) : (
      drawing
    )
  return bone.transform ? (
    <Group transform={bone.transform} origin={bone.origin}>
      {clipped}
    </Group>
  ) : (
    clipped
  )
}
