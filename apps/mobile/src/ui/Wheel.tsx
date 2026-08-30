import { useLayoutEffect, useRef } from 'react'
import { ScrollView, View } from 'react-native'

import { radius } from '@/theme/tokens'
import { cn } from './cn'
import { Text } from './Text'

/** One row of the wheel. `value` is what comes back; `label` is what is read. */
export type WheelOption = { value: string; label: string }

export type WheelProps = {
  options: readonly WheelOption[]
  /** The selected `value`. A value not in the list parks the wheel at the top. */
  value: string
  onChange: (value: string) => void
  /**
   * What a screen reader calls the column. A wheel is a run of near-identical
   * rows, so without this it announces a number and nothing about what the
   * number is for.
   */
  accessibilityLabel?: string
  className?: string
}

/** Row height, and how many rows are on show. Odd, so one of them is the middle. */
const ROW = 40
const VISIBLE = 5
/** Blank rows above and below, so the first and last option can reach the middle. */
const PAD = ROW * ((VISIBLE - 1) / 2)

/**
 * A spinning column: one of the wheels a date and a time are picked on.
 *
 * Built out of a `ScrollView`, because the platform's own is a native module and
 * a new native dependency means a new dev client, where this is wanted in builds
 * already on phones. `snapToInterval` does the work, and the value is read off
 * the offset once the scroll settles, so a flick through a year of dates is one
 * state change rather than three hundred.
 *
 * Presentational and domain-free: which dates are offered, and whether an hour is
 * twelve-hour, belongs to the caller.
 *
 * It wants more rows than it shows. A wheel with two options has a scrollable
 * range of one row, and iOS rounds a drag that short back to where it began, so
 * the column renders correctly and cannot be moved. A handful of choices is
 * something you tap rather than a dial you spin.
 *
 * It is also a control somebody might not be able to scroll, so it declares
 * itself `adjustable` and answers increment and decrement, which is what
 * VoiceOver's swipe up and down send.
 */
export function Wheel({ options, value, onChange, accessibilityLabel, className }: WheelProps) {
  const scroller = useRef<ScrollView>(null)

  const found = options.findIndex((option) => option.value === value)
  const index = found === -1 ? 0 : found

  /**
   * Where the wheel is parked, as the wheel itself last reported it.
   *
   * The guard rather than the position: the effect below has to move the wheel
   * when the value is changed from OUTSIDE (a new selection while the sheet is
   * open, a fresh mount), and must not move it when the value changed because
   * the wheel was scrolled — which would be a scroll fighting the momentum that
   * produced it, and lands as a visible twitch at the end of every flick.
   */
  const settled = useRef(index)

  // A LAYOUT effect: passive effects flush after the frame is painted, so the
  // first frame of every wheel would be the list parked at its top row and the
  // jump to the selection would be visible.
  useLayoutEffect(() => {
    if (settled.current === index) return
    settled.current = index
    scroller.current?.scrollTo({ y: index * ROW, animated: false })
  }, [index])

  // Once at mount, unconditionally, because `settled` starts equal to `index`
  // and the guard above would therefore skip the one scroll that matters.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the initial park, deliberately once
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ y: index * ROW, animated: false })
  }, [])

  /**
   * Where the wheel came to rest, which is the only offset worth reading. A flick
   * ends in momentum and fires `onMomentumScrollEnd`; a slow drag released with no
   * velocity fires `onScrollEndDrag` and nothing after it, so both are wired and
   * the drag handler commits only when no momentum will follow.
   *
   * Reading the release offset unconditionally had two faces: Save sits directly
   * under these wheels, so a flick followed by a tap wrote the row the finger
   * passed over, and committing mid-coast re-rendered the list under a
   * decelerating scroll view, which on iOS kills the deceleration where it is.
   */
  const commit = (offset: number) => {
    const row = Math.round(offset / ROW)
    const clamped = Math.min(options.length - 1, Math.max(0, row))
    settled.current = clamped
    const option = options[clamped]
    if (option && option.value !== value) onChange(option.value)
  }

  const step = (delta: 1 | -1) => {
    const next = options[Math.min(options.length - 1, Math.max(0, index + delta))]
    if (next && next.value !== value) onChange(next.value)
  }

  return (
    <View
      className={cn('overflow-hidden', className)}
      style={{ height: ROW * VISIBLE }}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: options[index]?.label }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') step(1)
        if (event.nativeEvent.actionName === 'decrement') step(-1)
      }}
    >
      {/* The band the selected row sits in, painted BEHIND the rows and taking no
          touches: a highlight on the row itself would move with the list during
          a scroll, and the whole point of a wheel is that the middle stays put. */}
      <View
        pointerEvents="none"
        className="absolute inset-x-0 bg-track"
        style={{ top: PAD, height: ROW, borderRadius: radius.sm }}
      />

      <ScrollView
        ref={scroller}
        /* AN EXPLICIT FRAME, and without it the wheel does not scroll at all.
           A `ScrollView` in a column has no default flex, so it lays out at its
           CONTENT height — 640pt for twelve hours plus the padding — inside a
           200pt parent that clips it. Content size equal to frame size means
           nothing to scroll: every wheel rendered correctly, showed five rows,
           and ignored every drag. The parent's `overflow-hidden` was hiding the
           other 440pt and hiding the bug with it. */
        style={{ height: ROW * VISIBLE }}
        /* The rows are hidden from the accessibility tree, all of them.
           A scroll view enumerates its whole content and not the part on screen,
           so a year of dates put 366 phantom labels into it — every one a `Text` a
           screen reader would stop on, most of them clipped out of sight. The
           container above is the accessible control: it is `adjustable`, it
           announces the selected row as its value, and it answers increment and
           decrement. */
        importantForAccessibility="no-hide-descendants"
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        // Without this a flick coasts for a second before the snap catches it,
        // and the wheel reads as a list that happens to line up rather than a
        // dial with notches in it.
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: PAD }}
        onMomentumScrollEnd={(event) => commit(event.nativeEvent.contentOffset.y)}
        /* Only when the release leaves nothing to coast. `velocity` is points per
           MILLISECOND, so a deliberate nudge reads in hundredths and the threshold
           is small; anything above it is a fling whose resting place
           `onMomentumScrollEnd` will report. iOS omits `velocity` on some releases,
           which is itself the no-momentum case. */
        onScrollEndDrag={(event) => {
          const velocity = Math.abs(event.nativeEvent.velocity?.y ?? 0)
          if (velocity < 0.05) commit(event.nativeEvent.contentOffset.y)
        }}
      >
        {options.map((option, row) => (
          <View
            key={option.value}
            style={{ height: ROW }}
            className="items-center justify-center px-1"
          >
            {/* The unselected rows are faint rather than hidden: what is above
                and below the middle is the context that makes a wheel readable
                at a glance. */}
            <Text
              numberOfLines={1}
              className={cn(
                'font-display text-[19px]',
                row === index ? 'text-heading' : 'text-faint',
              )}
            >
              {option.label}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
