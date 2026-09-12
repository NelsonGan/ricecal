import { useState } from 'react'
import { View } from 'react-native'
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { spacing } from '@/theme/tokens'
import { AppBar, type AppBarProps } from './AppBar'
import { Text } from './Text'

export type CollapsingAppBarProps = Omit<AppBarProps, 'className' | 'titleContent'> & {
  /** The page's vertical scroll offset. */
  scrollY: SharedValue<number>
  /** Offset at which the image's lower edge reaches this bar. */
  revealAt: number
}

/** How much travel the canvas and title use to replace the image behind them. */
const TRANSITION_DISTANCE = 48

/**
 * Navigation chrome for a page whose first thing is a full-bleed image.
 *
 * The controls stay fixed from the first frame. At rest their transparent bar
 * leaves the image visible behind the same raised buttons the old image overlay
 * used. As the image's lower edge reaches them, the canvas and title fade in
 * together. Reversing the scroll reverses the transition instead of toggling a
 * second header on and off.
 */
export function CollapsingAppBar({ scrollY, revealAt, title, ...appBar }: CollapsingAppBarProps) {
  const insets = useSafeAreaInsets()
  const [titleRevealed, setTitleRevealed] = useState(false)

  // Opacity is visual only. Mirror the threshold into React state once per
  // crossing so a screen reader does not encounter an invisible copy of the
  // large dish heading while the image is still on screen.
  useAnimatedReaction(
    () => scrollY.value >= revealAt,
    (revealed, previous) => {
      if (revealed !== previous) runOnJS(setTitleRevealed)(revealed)
    },
    [revealAt],
  )

  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [revealAt - TRANSITION_DISTANCE / 2, revealAt + TRANSITION_DISTANCE / 2],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }))
  const titleStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      scrollY.value,
      [revealAt - TRANSITION_DISTANCE / 2, revealAt + TRANSITION_DISTANCE / 2],
      [0, 1],
      Extrapolation.CLAMP,
    )
    return {
      opacity: progress,
      transform: [{ translateY: interpolate(progress, [0, 1], [4, 0]) }],
    }
  })

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 z-20 px-3 pb-sm"
      style={{ paddingTop: insets.top + spacing.sm }}
    >
      <Reanimated.View
        pointerEvents="none"
        className="absolute inset-0 border-b border-line bg-canvas"
        style={surfaceStyle}
      />
      <AppBar
        {...appBar}
        title=""
        titleContent={
          title ? (
            <Reanimated.View
              style={titleStyle}
              accessibilityElementsHidden={!titleRevealed}
              importantForAccessibility={titleRevealed ? 'auto' : 'no-hide-descendants'}
            >
              <Text variant="subtitle" className="text-center" numberOfLines={1}>
                {title}
              </Text>
            </Reanimated.View>
          ) : undefined
        }
        className="rounded-none bg-transparent p-0"
      />
    </View>
  )
}
