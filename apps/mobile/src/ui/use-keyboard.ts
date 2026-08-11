import { useEffect, useRef, useState } from 'react'
import { Animated, Keyboard, Platform } from 'react-native'

/**
 * How far the keyboard reaches up into a full-screen view, in three shapes: the
 * plain fact of one being open, the overlap in points, and the same overlap as
 * something to translate by.
 *
 * THE OVERLAP IS ALWAYS ZERO ON ANDROID, where `adjustResize` — which Expo sets
 * by default — has already resized the window out from under the keyboard, and
 * moving anything again would count it twice. `up` is true on both.
 *
 * `keyboardWillChangeFrame` rather than a will-show and a will-hide, which is
 * the event `KeyboardAvoidingView` picks for the same job: one notification
 * covers arriving, leaving, growing a suggestion bar, and the interactive
 * drag-to-dismiss, where nothing else fires until the finger lets go.
 *
 * It exists because the two things that used to read the keyboard for us both
 * measured it at the wrong moment. See the notes in `Screen` and `Sheet`.
 */
export function useKeyboard(windowHeight: number) {
  const [state, setState] = useState(() => ({ up: Keyboard.isVisible(), overlap: 0 }))
  /** Negative, because everything it moves travels upwards. */
  const shift = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      const shown = Keyboard.addListener('keyboardDidShow', () =>
        setState({ up: true, overlap: 0 }),
      )
      const hidden = Keyboard.addListener('keyboardDidHide', () =>
        setState({ up: false, overlap: 0 }),
      )
      return () => {
        shown.remove()
        hidden.remove()
      }
    }

    const change = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      const overlap = Math.max(0, windowHeight - event.endCoordinates.screenY)
      setState({ up: overlap > 0, overlap })
      // The keyboard's own duration and no less than a frame of it, so whatever
      // rides on this travels with the keys rather than jumping to where they
      // are about to be. It is what `KeyboardAvoidingView` was doing through
      // LayoutAnimation, and a transform can be handed to the native driver.
      Animated.timing(shift, {
        toValue: -overlap,
        duration: Math.max(event.duration, 10),
        useNativeDriver: true,
      }).start()
    })
    return () => change.remove()
  }, [shift, windowHeight])

  return { ...state, shift }
}
