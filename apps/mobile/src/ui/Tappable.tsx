import * as Haptics from 'expo-haptics'
import { forwardRef, useCallback } from 'react'
import { Pressable, type PressableProps, type ViewInstance } from 'react-native'

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
 * A long press is felt when it lands, a step heavier (Medium, as a swipe row
 * arming), whether or not the press-in was: a row that only answers a long
 * press keeps `haptics` off so scrolling over it stays quiet, and the hold was
 * then the one thing it did without saying so.
 *
 * A haptics failure never takes down a tap: the engine is absent on a simulator
 * and switched off on plenty of real phones.
 */
export const Tappable = forwardRef<ViewInstance, TappableProps>(function Tappable(
  { haptics = true, onPressIn, onLongPress, disabled, ...rest },
  ref,
) {
  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (event) => {
      if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      onPressIn?.(event)
    },
    [haptics, onPressIn],
  )
  const handleLongPress = useCallback<NonNullable<PressableProps['onLongPress']>>(
    (event) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
      onLongPress?.(event)
    },
    [onLongPress],
  )

  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      onPressIn={handlePressIn}
      // Only when asked for: a Pressable with a long-press handler holds a
      // press back to tell the two apart.
      onLongPress={onLongPress ? handleLongPress : undefined}
      {...rest}
    />
  )
})
