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
 * `Pressable`, with the tap you can feel.
 *
 * Every interactive surface in the app goes through this rather than through
 * `Pressable` directly, which is the whole point: haptics were on the raised
 * controls only, because `Squish` happened to implement them, and everything flat
 * — a tab, a switch, a list row, a segmented control, a meal card's add button —
 * silently did nothing in the hand. Nobody forgot; there was simply no shared
 * place to put it, so each new pressable started out without it.
 *
 * On press IN, not on press. Feedback that waits for the release arrives after
 * the screen has already reacted, which reads as lag rather than as touch.
 *
 * Light everywhere. This fires dozens of times a session and the heavier styles
 * are reserved for things that are not merely a tap — a confirmation landing, a
 * limit being hit.
 *
 * Never lets a haptics failure take down a tap: the engine is absent on a
 * simulator and switched off on plenty of real phones, and neither is a reason
 * for a button to stop working.
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
