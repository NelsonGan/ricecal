import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, useWindowDimensions, View } from 'react-native'

import { FLOAT_SHADOW } from './BottomNav'
import { Icon } from './Icon'
import { Tappable } from './Tappable'
import { Text } from './Text'

/**
 * A small ⓘ that says where something came from, in a bubble pointing at it.
 *
 * Nothing shows until the ⓘ itself is tapped: a figure that explains itself on
 * any touch got opened by thumbs on their way to the sets. The bubble floats
 * over the screen in a transparent modal, so it never pushes the layout about
 * and is never clipped by the card it sits in, and closes on any tap or by
 * itself after a few seconds.
 */

const BUBBLE_MAX = 280
const EDGE = 16
const GAP = 6
/** Room a two-line bubble needs below the button before it opens above instead. */
const ROOM_BELOW = 120
const OPEN_MS = 6000

type Anchor = { x: number; y: number; w: number; h: number }

export function InfoTip({ text, size = 14 }: { text: string; size?: number }) {
  const anchor = useRef<View>(null)
  const [at, setAt] = useState<Anchor | null>(null)
  // Where it last opened, so the bubble fades out with the modal rather than
  // vanishing the moment it is closed.
  const last = useRef<Anchor | null>(null)
  if (at) last.current = at
  const shown = at ?? last.current
  const window = useWindowDimensions()

  useEffect(() => {
    if (!at) return
    const timer = setTimeout(() => setAt(null), OPEN_MS)
    return () => clearTimeout(timer)
  }, [at])

  const open = () => anchor.current?.measureInWindow((x, y, w, h) => setAt({ x, y, w, h }))

  const width = Math.min(BUBBLE_MAX, window.width - EDGE * 2)
  const centre = shown ? shown.x + shown.w / 2 : 0
  const left = Math.max(EDGE, Math.min(centre - width / 2, window.width - EDGE - width))
  const below = shown ? shown.y + shown.h + ROOM_BELOW < window.height : true

  return (
    <>
      <Tappable
        ref={anchor}
        onPress={open}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={text}
      >
        <Icon set="ui" name="info" size={size} />
      </Tappable>
      <Modal
        visible={at !== null}
        transparent
        animationType="fade"
        // Edge to edge, as `Dialog` is: `measureInWindow` counts from the top
        // of the screen, and a modal starting under the status bar on Android
        // drew the bubble one bar's height too low.
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setAt(null)}
      >
        <Pressable
          className="flex-1"
          onPress={() => setAt(null)}
          // The whole screen closes it; read out, it says what it is showing.
          accessibilityRole="button"
          accessibilityLabel={text}
          accessibilityViewIsModal
        >
          {shown ? (
            <View
              pointerEvents="none"
              style={[
                { position: 'absolute', left, width },
                below
                  ? { top: shown.y + shown.h + GAP }
                  : { bottom: window.height - shown.y + GAP },
              ]}
            >
              <View
                className="absolute h-3 w-3 rotate-45 bg-inverse"
                style={[
                  { left: Math.max(12, Math.min(centre - left - 6, width - 24)) },
                  below ? { top: -5 } : { bottom: -5 },
                ]}
              />
              <View className="rounded-md bg-inverse px-3.5 py-2.5" style={FLOAT_SHADOW}>
                <Text className="font-body-bold text-[14px] leading-[19px] text-on-inverse">
                  {text}
                </Text>
              </View>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  )
}
