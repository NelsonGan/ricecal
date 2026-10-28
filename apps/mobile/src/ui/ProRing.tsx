import { Canvas, LinearGradient, Path, RoundedRect, Skia, vec } from '@shopify/react-native-skia'
import { type ReactNode, useEffect, useMemo } from 'react'
import { View } from 'react-native'
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { radius as radiusScale } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'

/**
 * The face sizes, as `Avatar` draws them. Kept beside the frame because the
 * frame is drawn to exactly this box.
 */
const FACE = {
  xs: { box: 30, radius: 11 },
  sm: { box: 40, radius: 14 },
  md: { box: 52, radius: 18 },
  lg: { box: 64, radius: radiusScale.sheet },
} as const

/**
 * How thick the gold is and the cream gap inside it, per size. Thick enough
 * to read as a frame on a 30pt face in a stack, never so thick it eats one.
 */
const FRAME = {
  xs: { gold: 2.5, gap: 1.5 },
  sm: { gold: 3.5, gap: 1.5 },
  md: { gold: 4.5, gap: 2 },
  lg: { gold: 5, gap: 2.5 },
} as const

/**
 * Metal rather than paint: a champagne highlight, a bright gold body, a warm
 * amber turn and a second highlight where the light comes back round. The
 * same in both themes, because a dark-mode gold reads as brown.
 */
const GOLD = ['#FFE79A', '#F6BF2A', '#D58E0C', '#F0B526', '#FFDD80']
const GOLD_POSITIONS = [0, 0.3, 0.55, 0.8, 1]

/** The sheen: a soft white peak, half as wide as this either side of it. */
const SHEEN = [
  'rgba(255, 255, 255, 0)',
  'rgba(255, 255, 255, 0)',
  'rgba(255, 255, 255, 0.85)',
  'rgba(255, 255, 255, 0)',
  'rgba(255, 255, 255, 0)',
]
const SHEEN_HALF = 0.14
const OFF_START = -SHEEN_HALF
const OFF_END = 1 + SHEEN_HALF

/** One sweep of the sheen, then a rest long enough that it reads as a glint. */
const SHEEN_MS = 1100
const SHEEN_REST_MS = 3600

export type ProRingSize = keyof typeof FACE

/**
 * A Pro member's face, set in gold.
 *
 * Drawn inside the face's own box: the gold frame and a cream gap take the
 * outer edge and the face is scaled down to sit within them, so a face with
 * the frame takes exactly the room of one without and no list reflows when
 * somebody subscribes.
 *
 * The large sizes (Me, a profile) also carry a sparkle badge, a soft glow and
 * a sheen that sweeps across the gold every few seconds. In lists the sheen
 * is a still highlight: a running animation per face in a scrolling list is a
 * cost nobody would notice the benefit of. Reduce Motion stills it everywhere.
 */
export function ProRing({
  pro,
  size = 'md',
  children,
}: {
  pro?: boolean | null
  size?: ProRingSize
  children: ReactNode
}) {
  // The wrapper is there either way, so a frame arriving with the entitlement
  // does not remount the face (and its image) under a new parent.
  if (!pro) return <View>{children}</View>
  return <GoldFrame size={size}>{children}</GoldFrame>
}

function GoldFrame({ size, children }: { size: ProRingSize; children: ReactNode }) {
  const colors = useThemeColors()
  const reduceMotion = useReducedMotion()
  const { box, radius } = FACE[size]
  const { gold, gap } = FRAME[size]
  const large = size === 'md' || size === 'lg'
  const animated = large && !reduceMotion
  const inset = gold + gap
  const scale = (box - inset * 2) / box

  // Where the sheen is along the top-left to bottom-right diagonal, 0 to 1,
  // starting and ending off the frame so a sweep enters and leaves cleanly.
  // A still frame parks it at the top left, where a highlight looks natural.
  const sweep = useSharedValue(animated ? OFF_START : 0.22)
  useEffect(() => {
    if (!animated) return
    sweep.value = withRepeat(
      withSequence(
        withTiming(OFF_START, { duration: 0 }),
        withDelay(
          SHEEN_REST_MS,
          withTiming(OFF_END, { duration: SHEEN_MS, easing: Easing.inOut(Easing.quad) }),
        ),
      ),
      -1,
    )
    return () => cancelAnimation(sweep)
  }, [animated, sweep])

  // A bright band across the diagonal: a gradient along it, transparent but
  // for a soft white peak at `sweep`, painted over the gold and clipped to
  // it, so only the frame catches the light.
  const sheenPositions = useDerivedValue(() => {
    const p = sweep.value
    const clamp = (v: number) => Math.min(1, Math.max(0, v))
    return [0, clamp(p - SHEEN_HALF), clamp(p), clamp(p + SHEEN_HALF), 1]
  })

  const goldShape = useMemo(() => {
    const outer = Skia.RRectXY(Skia.XYWHRect(0, 0, box, box), radius, radius)
    return Skia.PathBuilder.Make().addRRect(outer).detach()
  }, [box, radius])

  const innerRadius = Math.max(2, radius - gold)

  return (
    <View
      style={[
        { width: box, height: box },
        large
          ? {
              shadowColor: '#F2B51F',
              shadowOpacity: 0.45,
              shadowRadius: size === 'lg' ? 8 : 6,
              shadowOffset: { width: 0, height: 0 },
              elevation: 4,
              borderRadius: radius,
            }
          : null,
      ]}
    >
      <Canvas
        style={{ position: 'absolute', width: box, height: box }}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* The gold, light falling from the top left. */}
        <Path path={goldShape}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(box, box)}
            colors={GOLD}
            positions={GOLD_POSITIONS}
          />
        </Path>
        {/* The sheen, painted over the gold in the gold's own shape. */}
        <Path path={goldShape}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(box, box)}
            colors={SHEEN}
            positions={sheenPositions}
          />
        </Path>
        {/* A bright lip along the outer edge, the metal's polished rim. */}
        <RoundedRect
          x={0.5}
          y={0.5}
          width={box - 1}
          height={box - 1}
          r={radius}
          style="stroke"
          strokeWidth={1}
          color="rgba(255, 248, 220, 0.7)"
        />
        {/* The cream setting between the gold and the face. */}
        <RoundedRect
          x={gold}
          y={gold}
          width={box - gold * 2}
          height={box - gold * 2}
          r={innerRadius}
          color={colors.surface}
        />
      </Canvas>
      {/* The face, in a rounded window a touch smaller than the setting: the
          avatar's own fill can show as a hairline at a scaled edge, and the
          window crops it. */}
      <View
        style={{
          position: 'absolute',
          top: inset,
          left: inset,
          width: box - inset * 2,
          height: box - inset * 2,
          borderRadius: Math.max(2, innerRadius - gap),
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: box, height: box, transform: [{ scale: scale * 1.04 }] }}>
          {children}
        </View>
      </View>
      {large ? <Sparkle size={size} /> : null}
    </View>
  )
}

/**
 * The small gold medallion with a four-point star, pinned to the top right
 * corner of the large faces. Outside the box, so it costs no layout.
 */
function Sparkle({ size }: { size: ProRingSize }) {
  const colors = useThemeColors()
  const d = size === 'lg' ? 20 : 16
  const star = useMemo(() => {
    const c = d / 2
    const r = d * 0.3
    const w = r * 0.32
    return Skia.PathBuilder.Make()
      .moveTo(c, c - r)
      .quadTo(c + w * 0.3, c - w * 0.3, c + r, c)
      .quadTo(c + w * 0.3, c + w * 0.3, c, c + r)
      .quadTo(c - w * 0.3, c + w * 0.3, c - r, c)
      .quadTo(c - w * 0.3, c - w * 0.3, c, c - r)
      .close()
      .detach()
  }, [d])
  return (
    <Canvas
      style={{ position: 'absolute', top: -d * 0.3, right: -d * 0.3, width: d, height: d }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* A ring of the surface colour lifts it off whatever is behind. */}
      <RoundedRect x={0} y={0} width={d} height={d} r={d / 2} color={colors.surface} />
      <RoundedRect x={1.5} y={1.5} width={d - 3} height={d - 3} r={(d - 3) / 2}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(d, d)}
          colors={['#FFE99A', '#F2B51F', '#D9900F']}
        />
      </RoundedRect>
      <Path path={star} color="#FFFFFF" />
    </Canvas>
  )
}
