import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type TextInput, type TextInputProps, View } from 'react-native'
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { motion, radius, slab, spacing } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Icon } from './Icon'
import { Squish } from './Squish'
import { Tappable } from './Tappable'
import { Text } from './Text'

/**
 * Layout of the pad, in points, and the arithmetic that turns it into a height.
 *
 * A number rather than a measurement, because everything that gets out of the
 * pad's way is positioned before the pad has drawn a frame: the footer's lift,
 * the scroll view's bottom padding and the scroll that brings the focused field
 * into view all read it on the tick the pad opens. Measuring would move
 * everything a frame later, which is a visible settle.
 *
 * `KEY_HEIGHT` is duplicated in `KEY_BOX` because NativeWind needs a literal
 * class. They have to be edited together, or a row of keys ends up under the
 * bottom of the window.
 */
const KEY_HEIGHT = 48
const KEY_BOX = 'h-[48px]'
const KEY_GAP = spacing.sm
const HEADER_HEIGHT = 36
const PANEL_PAD = 10

/** What the pad occupies above the home indicator's inset. */
export const NUMPAD_BODY_HEIGHT =
  PANEL_PAD * 2 + HEADER_HEIGHT + KEY_GAP + KEY_HEIGHT * 4 + KEY_GAP * 3

/** Digits, then the decimal point, zero, and a rub-out. */
const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'back'],
] as const

/**
 * More digits than any figure the pad was built for. A default rather than the
 * limit, since a barcode is 13 digits and is typed here whenever a camera cannot
 * read the label. A field states its own `maxLength` and the pad honours it.
 */
const MAX_LENGTH = 8

/**
 * What the pad needs from the field it is driving, read fresh on every press. A
 * ref rather than a value: the pad is mounted once and outlives every keystroke,
 * so a handler closed over the value it opened with would append the second
 * digit to a number one digit old.
 */
export type NumpadFieldSpec = {
  value: string
  onChangeText: (next: string) => void
  /** Whether the decimal key is offered. Off for a whole number: calories, age. */
  decimal: boolean
  /** Named in the pad's header. The field itself may be under the pad. */
  label?: string
  /** How many characters the field will hold. See `MAX_LENGTH` for the default. */
  maxLength: number
  /** The first key replaces the value rather than appending to it. */
  replaceFirst: boolean
}

type Session = {
  /** Which `NumpadHost` draws the pad. See `NumpadHost` for why this is needed. */
  hostId: string
  field: { current: NumpadFieldSpec }
  /** Ends the edit the way tapping away from a keyboard does: through blur. */
  blur: () => void
  /** Where the field is on screen, so a host can scroll it clear of the pad. */
  measure: (report: (top: number, height: number) => void) => void
}

type NumpadValue = {
  /** The field being edited, or null. Drives geometry the moment it changes. */
  session: Session | null
  /** What is drawn — the session, held through the close animation. */
  shown: Session | null
  /** Points the pad occupies at the bottom of the window when it is open. */
  height: number
  /** The same, animated, for anything that moves on the UI thread. */
  offset: SharedValue<number>
  labels: NumpadLabels
  open: (session: Session) => void
  /** Closes only if that session still owns the pad. */
  close: (session: Session) => void
  /** Closes whatever is open. What a scroll does, the way a keyboard dismisses. */
  dismiss: () => void
}

const NumpadContext = createContext<NumpadValue | null>(null)

/**
 * Which host is nearest above a field.
 *
 * A `Sheet` is a native modal window and nothing in the app's tree draws over
 * it, so a pad at the root would be behind the sheet whose field opened it.
 * Every bottom-anchored container hosts a pad and the nearest one draws:
 * `Screen` for a page, `Sheet` for the panel over it.
 *
 * The empty string is "no host", which a field outside both gets: it opens
 * nothing rather than a pad nobody can see.
 */
const HostContext = createContext<string>('')

export type NumpadLabels = {
  /** The button that ends the edit. */
  done: string
  /** Screen-reader name for the rub-out key. */
  backspace: string
  /** Screen-reader name for the decimal key. */
  decimal: string
}

function useNumpad() {
  return useContext(NumpadContext)
}

export type NumpadProviderProps = {
  children: ReactNode
  /**
   * Copy, passed in rather than translated here: the design system knows no
   * words. This one differs only in that its caller is the root layout.
   */
  labels: NumpadLabels
}

/**
 * The app's own number pad, and the state of whichever field is using it.
 *
 * It exists because the system one stopped being a keyboard we could lay out
 * against: a number pad has no return key, so iOS 26 floats a "Done" pill inside
 * the keyboard frame the app is told about while the keys are not. Everything
 * positioned against that frame clears a control it cannot see, and the strip it
 * leaves shows the diary through it.
 *
 * So the app draws the pad. `showSoftInputOnFocus={false}` gives the field a
 * caret and no keyboard on both platforms, and the height is a constant this
 * file owns.
 *
 * `keyboardType` stays on the fields regardless: it does nothing while the pad
 * is up, and it is what they fall back to on a platform that declines to
 * suppress the keyboard.
 */
export function NumpadProvider({ children, labels }: NumpadProviderProps) {
  const insets = useSafeAreaInsets()
  const [session, setSession] = useState<Session | null>(null)
  /**
   * What the host draws, which lags `session` by one animation on the way out.
   * Unmounting on close would take the pad off screen in a frame and leave the
   * footer sliding down over nothing.
   */
  const [shown, setShown] = useState<Session | null>(null)

  const height = NUMPAD_BODY_HEIGHT + insets.bottom
  const offset = useSharedValue(0)

  useEffect(() => {
    const easing = Easing.bezier(0.2, 0.8, 0.2, 1)
    if (session) {
      setShown(session)
      offset.value = withTiming(height, { duration: motion.panel, easing })
      return
    }
    offset.value = withTiming(0, { duration: motion.panel, easing })
    const timer = setTimeout(() => setShown(null), motion.panel)
    return () => clearTimeout(timer)
  }, [session, height, offset])

  /**
   * The open session, readable outside a render. `dismiss` blurs the field with
   * it, which from inside a state updater would be a side effect in a function
   * React is free to call twice.
   */
  const current = useRef<Session | null>(null)
  current.current = session

  const open = useCallback((next: Session) => setSession(next), [])
  // Identity-checked, because blur arrives AFTER the next field's focus when a
  // tap moves from one field to another. Closing unconditionally would take the
  // pad down on the field that had just opened it.
  const close = useCallback(
    (which: Session) => setSession((open) => (open === which ? null : open)),
    [],
  )
  const dismiss = useCallback(() => {
    // Nothing open is the common case: `Screen` calls this on every scroll that
    // starts, and almost none have a pad up. Without the guard, every drag in
    // the app pushes a state update through the provider above the whole tree.
    if (!current.current) return
    // Blur first: the field's own `onBlur` is what commits the number, and
    // every caller hangs its commit there rather than on a key. Closing without
    // it would take the pad away and leave the value uncommitted.
    current.current.blur()
    setSession(null)
  }, [])

  const value = useMemo<NumpadValue>(
    () => ({ session, shown, height, offset, labels, open, close, dismiss }),
    [session, shown, height, offset, labels, open, close, dismiss],
  )

  return <NumpadContext.Provider value={value}>{children}</NumpadContext.Provider>
}

export type NumpadFieldOptions = {
  value: string
  onChangeText: (next: string) => void
  /** Off for a whole number. The key becomes a blank rather than moving the grid. */
  decimal?: boolean
  /** Named in the pad's header, since the field may be under the pad. */
  label?: string
  /**
   * The field's own limit, from `TextField`'s `maxLength`. It has to reach the
   * pad because suppressing the system keyboard also suppresses the platform's
   * enforcement of it.
   */
  maxLength?: number
  /** The first key replaces the value. What `selectTextOnFocus` used to buy. */
  replaceFirst?: boolean
  /** Pass a field's own handlers through; this hook composes rather than replaces. */
  onFocus?: () => void
  onBlur?: () => void
  /**
   * Off leaves the field on the system keyboard, handlers and all. For a
   * component whose numeric-ness is a prop, since a hook cannot be called
   * conditionally.
   */
  enabled?: boolean
  /**
   * The return key the field would ask for without this pad, handed over rather
   * than set in JSX. The spread goes last so its handlers win, which means a
   * `returnKeyType` left on the element cannot be suppressed from here and one
   * returned as `undefined` would wipe the caller's on the fallback path.
   */
  returnKeyType?: TextInputProps['returnKeyType']
}

/**
 * Turns a `TextInput` into a field the app's own pad drives. Spread the result
 * last, after the caller's own props: it composes `onFocus` and `onBlur`, and
 * the composed pair has to win.
 */
export function useNumpadField({
  value,
  onChangeText,
  decimal = true,
  maxLength = MAX_LENGTH,
  label,
  replaceFirst = false,
  onFocus,
  onBlur,
  enabled = true,
  returnKeyType,
}: NumpadFieldOptions) {
  const context = useNumpad()
  const hostId = useContext(HostContext)
  const input = useRef<TextInput>(null)

  // Written on every render, read on every key. See `NumpadFieldSpec`.
  const field = useRef<NumpadFieldSpec>({
    value,
    onChangeText,
    decimal,
    label,
    maxLength,
    replaceFirst,
  })
  field.current = { value, onChangeText, decimal, label, maxLength, replaceFirst }

  // One session object for the life of the field, so `close` can tell whether
  // the pad it is being asked to shut is still this field's.
  const session = useRef<Session | null>(null)
  if (!session.current) {
    session.current = {
      hostId,
      field,
      blur: () => input.current?.blur(),
      measure: (report) => input.current?.measureInWindow((_x, y, _w, h) => report(y, h)),
    }
  }
  session.current.hostId = hostId

  const live = enabled && Boolean(context) && hostId !== ''

  /**
   * A field that wanted the pad and could not find a host to draw it.
   *
   * Loud, because the fallback is the bug this file exists to remove wearing a
   * disguise: the field keeps the system keyboard, which for a numeric one is the
   * pad with the floating pill on it. It happened once, when the calorie total
   * called this hook up in the route rather than inside the screen.
   *
   * A warning rather than a throw: the field still works on the platform's
   * keyboard, and crashing a screen over a layout mistake is worse.
   */
  useEffect(() => {
    if (!__DEV__ || !enabled || !context || hostId !== '') return
    console.warn(
      'useNumpadField: no <NumpadHost> above this field, so it is on the system keyboard. ' +
        'Render it inside a Screen or a Sheet rather than in the component that returns one.',
    )
  }, [enabled, context, hostId])

  /**
   * The two handlers, pulled out of the context value. They are stable where the
   * object is not, since its identity changes on every open, close and keystroke.
   * Depending on the object made the unmount guard re-run on the render that
   * opened the pad, and its cleanup closes: the pad vanished inside one frame.
   */
  const openPad = context?.open
  const closePad = context?.close

  // A field can be unmounted mid-edit — the totals card swaps its input back
  // for a heading the moment `editing` clears — and an unmount fires no blur.
  useEffect(() => {
    const mine = session.current
    return () => {
      if (mine) closePad?.(mine)
    }
  }, [closePad])

  const handleFocus = useCallback(() => {
    if (live && session.current) openPad?.(session.current)
    onFocus?.()
  }, [live, openPad, onFocus])

  const handleBlur = useCallback(() => {
    if (session.current) closePad?.(session.current)
    onBlur?.()
  }, [closePad, onBlur])

  const active = live && context?.session === session.current

  return {
    ref: input,
    onFocus: handleFocus,
    onBlur: handleBlur,
    // The one line that removes the system keyboard. On iOS it hands UIKit an
    // empty input view, which keeps the caret blinking; on Android it is the
    // same prop it has always had.
    showSoftInputOnFocus: !live,
    /**
     * No `done` return key while the pad is driving, which is the other half of
     * suppressing the keyboard. A number pad has no return key, so asking for
     * `returnKeyType="done"` asks iOS 26 for the floating "Done" pill, which is
     * not part of the input view: an empty input view takes the keys away and
     * leaves the pill over the bottom-right of this pad.
     *
     * `undefined` rather than another value, so a field that sets its own is left
     * alone and the fallback path passes the caller's through.
     */
    returnKeyType: live ? undefined : returnKeyType,
    /**
     * The caret lives at the end, where the pad writes. Controlled only while the
     * pad is driving: a controlled selection fights the platform's own caret
     * handling, and is worth it only where the value changes by no other route.
     */
    selection: active ? { start: value.length, end: value.length } : undefined,
  }
}

export type NumpadHostProps = {
  children: ReactNode
  /**
   * This host's identity, from `useNumpadZone`. Passed in rather than minted
   * here, because the container also has to know how much room its own pad is
   * taking, and one id means the two halves cannot disagree.
   */
  id?: string
  /**
   * Fired when a field under this host takes the pad, with a way to measure it.
   * A host that scrolls uses it to bring the field back above the pad.
   */
  onOpen?: (measure: Session['measure']) => void
}

/**
 * Draws the pad for the fields under it, and nothing when the pad belongs to
 * somebody else. No box of its own: the pad is absolutely positioned, so it
 * lands against the bottom of whatever view the host was placed in.
 */
export function NumpadHost({ children, id: given, onOpen }: NumpadHostProps) {
  const own = useId()
  const id = given ?? own
  const context = useNumpad()
  const shown = context?.shown?.hostId === id ? context.shown : null
  const opening = context?.session?.hostId === id ? context.session : null

  useEffect(() => {
    if (!opening || !onOpen) return
    // A frame later, so the field is measured against a layout that already
    // has the pad's padding in it. Measured on the same tick, a field near the
    // bottom reports a position the scroll is about to invalidate.
    const frame = requestAnimationFrame(() => onOpen(opening.measure))
    return () => cancelAnimationFrame(frame)
  }, [opening, onOpen])

  return (
    <HostContext.Provider value={id}>
      {children}
      {shown && context ? <NumpadSurface session={shown} context={context} /> : null}
    </HostContext.Provider>
  )
}

/**
 * A pad host, and how much room its own pad is taking.
 *
 * The `id` pairs with the `NumpadHost` the caller renders, and the scoping is
 * why it exists: the provider holds one `offset` for the app, and read directly
 * it moves every container in the tree, including ones that cannot see the pad.
 *
 * Not a rare case. A field keeps focus when you navigate away from it, because
 * suppressing the system keyboard removes the reason the platform had to resign
 * first responder, so the session stays open under the screen you are looking
 * at. Every footer mounted after it then sat the pad's full height off the
 * bottom: onboarding's weight field is the first numeric field a new user meets,
 * which is why a log button floated a third of the way up the app.
 *
 * `height` is 0 unless this host's pad is open, so a caller can add it to a
 * padding without a conditional. `offset` is the animated twin, following
 * `shown` as well as `session` because `shown` lags on the way out.
 */
export function useNumpadZone() {
  const id = useId()
  const context = useNumpad()
  const still = useSharedValue(0)
  const mine = context?.session?.hostId === id || context?.shown?.hostId === id

  return {
    id,
    height: context?.session?.hostId === id ? context.height : 0,
    offset: mine && context ? context.offset : still,
    dismiss: context?.dismiss,
  }
}

function NumpadSurface({ session, context }: { session: Session; context: NumpadValue }) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const spec = session.field.current

  /**
   * True until the first key of an edit, and only interesting for a field that
   * asked for `replaceFirst`. A ref rather than state, since nothing on screen
   * depends on it.
   */
  const pristine = useRef(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new session is a new edit
  useEffect(() => {
    pristine.current = true
  }, [session])

  const press = useCallback(
    (key: string) => {
      const live = session.field.current
      const base = pristine.current && live.replaceFirst ? '' : live.value
      pristine.current = false

      if (key === 'back') {
        // On a field that opened with everything selected, the first rub-out
        // clears it — which is what "selected" meant.
        live.onChangeText(base === live.value ? live.value.slice(0, -1) : '')
        return
      }
      if (key === '.') {
        if (base.includes('.')) return
        live.onChangeText(`${base || '0'}.`)
        return
      }
      if (base.length >= live.maxLength) return
      // "0" is a value, "07" is a typo. Anything else appends.
      live.onChangeText(base === '0' ? key : base + key)
    },
    [session],
  )

  /**
   * The worklet takes two numbers rather than the context, which looks like a
   * pointless destructure and is the difference between the pad working and the
   * pad silently refusing to type a second digit.
   *
   * Reanimated freezes every object a worklet closes over. Written as
   * `context.height - context.offset.value` it captures `context`, which holds
   * the `field` ref `useNumpadField` writes the live value into, so that write
   * does nothing and every key appends to the value the field had when it was
   * focused. "1" then "2" leaves a field reading "2"; in a release build
   * Reanimated says nothing about it.
   */
  const panelHeight = context.height
  const panelOffset = context.offset
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: panelHeight - panelOffset.value }],
  }))

  return (
    <Animated.View
      className="absolute inset-x-0 bottom-0 border-line border-t bg-surface-alt px-gutter"
      style={[
        { paddingTop: PANEL_PAD, paddingBottom: PANEL_PAD + insets.bottom },
        { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
        slide,
      ]}
    >
      {/* Says what is being edited, because the field itself is often under the
          pad by the time it opens, and carries the way out on the right — where
          the platform's own pill had taught everybody to reach. */}
      <View
        className="flex-row items-center justify-between"
        style={{ height: HEADER_HEIGHT, marginBottom: KEY_GAP }}
      >
        <Text variant="label" numberOfLines={1} className="flex-1">
          {spec.label ?? ''}
        </Text>
        <Tappable
          className="px-2 py-1.5"
          onPress={context.dismiss}
          accessibilityRole="button"
          accessibilityLabel={context.labels.done}
        >
          <Text variant="label" className="text-pandan-ink">
            {context.labels.done}
          </Text>
        </Tappable>
      </View>

      <View style={{ gap: KEY_GAP }}>
        {ROWS.map((row) => (
          <View key={row[0]} className="flex-row" style={{ gap: KEY_GAP }}>
            {row.map((key) => {
              // The decimal key is blanked rather than dropped on a whole-number
              // field. Dropped, the row rebalances and 0 slides off centre —
              // and 0 is the key on that row anybody is aiming for.
              if (key === '.' && !spec.decimal) {
                return <View key={key} className={cn('flex-1', KEY_BOX)} />
              }
              return (
                <Squish
                  key={key}
                  containerClassName={cn('flex-1', KEY_BOX)}
                  className="flex-1 items-center justify-center bg-surface"
                  slabClassName="bg-line"
                  depth={slab.sm}
                  radius={radius.sm}
                  onPress={() => press(key)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    key === 'back'
                      ? context.labels.backspace
                      : key === '.'
                        ? context.labels.decimal
                        : key
                  }
                >
                  {key === 'back' ? (
                    // No rub-out in the icon set, and a trash can is a
                    // different promise. The arrow is what the a11y label
                    // above explains.
                    <Icon set="ui" name="arrow-left" size={22} tintColor={colors.muted} />
                  ) : (
                    <Text className="font-display text-[24px] text-heading">{key}</Text>
                  )}
                </Squish>
              )
            })}
          </View>
        ))}
      </View>
    </Animated.View>
  )
}
