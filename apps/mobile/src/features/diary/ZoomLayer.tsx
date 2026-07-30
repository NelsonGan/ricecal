import { type ReactNode, useEffect, useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

/** How long one zoom takes. Long enough to read as travel, short enough to feel free. */
export const ZOOM_MS = 300

/** How far past the frame the layer being left behind grows, going deeper. */
const NEAR = 1.16
/** And how far back the one being left behind falls, coming out. */
const FAR = 0.9

/** Where a zoom is anchored, in the layer's own coordinates. */
export type Origin = { x: number; y: number }

/** The middle, for a zoom with nothing to anchor to — a header button rather than a cell. */
export const CENTRE_ORIGIN: Origin = { x: -1, y: -1 }

export type ZoomLayerProps = {
  /**
   * Whether this layer is arriving or leaving.
   *
   * Not named `role`: biome reads a prop by that name as an ARIA role and rejects
   * the values, which is a fair reading of the name and not what this means.
   */
  part: 'arriving' | 'leaving'
  /** `in` goes deeper — year to month to day. `out` pulls back. */
  direction: 'in' | 'out'
  /**
   * The point the zoom pivots on, in this layer's coordinates: the centre of the
   * cell that was tapped. `CENTRE_ORIGIN` for the layer's own middle.
   */
  origin: Origin
  /** Fired once, when an arriving layer has settled. */
  onFinished?: () => void
  children: ReactNode
}

/**
 * One level of the diary's zoom, animating in or out.
 *
 * The effect is two layers moving the same way at once: going deeper, the level
 * being left behind grows past the frame and fades while the new one grows into
 * place from just under full size. Coming out, both shrink. Because they travel in
 * the same direction it reads as one continuous zoom rather than as a crossfade
 * between two screens.
 *
 * What sells it is the pivot. A plain scale grows everything away from the middle
 * of the screen; anchoring it on the cell that was tapped makes the new level
 * appear to come out of that cell, which is the thing Apple's calendar does and
 * the reason its zoom feels like a place rather than a transition.
 *
 * The pivot is arithmetic, not measurement. Every grid here lays itself out — a
 * month is seven columns of a known width, a year is three — so a cell's centre is
 * known without asking the platform where anything ended up, and the anchoring is
 * the standard translate-scale-translate: move the pivot to the centre, scale,
 * move it back.
 */
export function ZoomLayer({ part, direction, origin, onFinished, children }: ZoomLayerProps) {
  // The layer's own size, to turn an origin in its coordinates into an offset
  // from its centre — which is what a transform is measured against.
  const [size, setSize] = useState({ width: 0, height: 0 })

  const arriving = part === 'arriving'
  const from = arriving ? (direction === 'in' ? FAR + 0.06 : NEAR) : 1
  const to = arriving ? 1 : direction === 'in' ? NEAR : FAR

  const scale = useSharedValue(from)
  const opacity = useSharedValue(arriving ? 0 : 1)

  /**
   * Plays once, on mount, and that is the point.
   *
   * A layer that re-ran its entrance whenever its inputs changed would pulse every
   * time one of the day queries under it came back — which for the arriving layer is
   * three times in the first second. The values it reads are the ones it was
   * constructed with, so there is nothing later to react to.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only — see above
  useEffect(() => {
    const easing = Easing.out(Easing.cubic)
    scale.value = withTiming(to, { duration: ZOOM_MS, easing }, (finished) => {
      if (finished && onFinished) runOnJS(onFinished)()
    })
    opacity.value = withTiming(arriving ? 1 : 0, {
      // The layer on its way out clears the frame before the incoming one has
      // finished settling, so the two are never both at half strength over each
      // other — which is what makes a crossfade look like a crossfade.
      duration: arriving ? ZOOM_MS : ZOOM_MS * 0.7,
      easing,
    })
  }, [])

  const style = useAnimatedStyle(() => {
    const pivotX = origin.x < 0 ? 0 : origin.x - size.width / 2
    const pivotY = origin.y < 0 ? 0 : origin.y - size.height / 2

    return {
      opacity: opacity.value,
      transform: [
        { translateX: pivotX },
        { translateY: pivotY },
        { scale: scale.value },
        { translateX: -pivotX },
        { translateY: -pivotY },
      ],
    }
  })

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    )
  }

  return (
    <Animated.View
      // The one leaving is out of the flow and untouchable: it is a picture of
      // where the user just was, and a tap landing on it would open a day from a
      // month they have already left.
      className={arriving ? 'flex-1' : 'absolute inset-0'}
      style={style}
      onLayout={onLayout}
      pointerEvents={arriving ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  )
}
