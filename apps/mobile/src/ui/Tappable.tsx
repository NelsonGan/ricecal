import * as Haptics from 'expo-haptics'
import { forwardRef, useCallback } from 'react'
import { Pressable, type PressableProps, type View } from 'react-native'

export type TappableProps = PressableProps & {
  /**
   * Off for something that is not a control: a scrim that dismisses, a panel
   * whose only job is to swallow a press before it reaches one.
   */
  haptics?: boolean
}

/**
 * `Pressable`, with the tap you can feel. Every interactive surface goes through
 * this rather than `Pressable` directly, because haptics were on the raised
 * controls only, where `Squish` happened to implement them, and everything flat
 * did nothing in the hand.
 *
 * On press in rather than on press: feedback that waits for the release arrives
 * after the screen has reacted, which reads as lag.
 *
 * Light everywhere, since this fires dozens of times a session and the heavier
 * styles are for things that are not merely a tap.
 *
 * A haptics failure never takes down a tap: the engine is absent on a simulator
 * and switched off on plenty of real phones.
 */
export const Tappable = forwardRef<View, TappableProps>(function Tappable(
  { haptics = true, onPressIn, disabled, ...rest },
  ref,
) {
  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (event) => {
      if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      onPressIn?.(event)
    },
    [haptics, onPressIn],
  )

  return <Pressable ref={ref} disabled={disabled} onPressIn={handlePressIn} {...rest} />
})
