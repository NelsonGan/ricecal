import { View } from 'react-native'
import Reanimated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { spacing } from '@/theme/tokens'
import { AppBar, type AppBarProps } from './AppBar'

export type CollapsingAppBarProps = Omit<AppBarProps, 'className' | 'title' | 'titleContent'> & {
  /** The page's vertical scroll offset. */
  scrollY: SharedValue<number>
  /** Offset at which the image's lower edge reaches this bar. */
  revealAt: number
}

/** How much travel the canvas uses to replace the image behind it. */
const TRANSITION_DISTANCE = 48

/**
 * Navigation chrome for a page whose first thing is a full-bleed image.
 *
 * The controls stay fixed from the first frame. At rest their transparent bar
 * leaves the image visible behind the same raised buttons the old image overlay
 * used. As the image's lower edge reaches them, the canvas fades in beneath the
 * same controls. This deliberately has no title: four controls already occupy
 * the row, and a centred food name between them was reduced to a few letters.
 */
export function CollapsingAppBar({ scrollY, revealAt, ...appBar }: CollapsingAppBarProps) {
  const insets = useSafeAreaInsets()

  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [revealAt - TRANSITION_DISTANCE / 2, revealAt + TRANSITION_DISTANCE / 2],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }))
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
      <AppBar {...appBar} title="" className="rounded-none bg-transparent p-0" />
    </View>
  )
}
