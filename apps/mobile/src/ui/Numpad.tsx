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
import { type TextInput, View } from 'react-native'
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
 * The height has to be a NUMBER rather than a measurement, because everything
 * that gets out of the pad's way is positioned before the pad has drawn a
 * frame: the footer's lift, the scroll view's bottom padding, and the scroll
 * that brings the focused field back into view all read it on the same tick the
 * pad opens. Measuring instead would mean laying out the pad, reading it back
 * and then moving everything else a frame later, which is a visible settle.
 *
 * `KEY_HEIGHT` is duplicated in `KEY_BOX` because NativeWind needs a literal
 * class and cannot read a constant. They have to be edited together: a key
 * taller than the height this sum was built from would put a row of it under
 * the bottom of the window.
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
 * More digits than any figure the pad was built for: a calorie total, a weight,
 * a portion.
 *
 * A DEFAULT rather than the limit, since a barcode arrived — 13 digits on a
 * packet, 14 once padded — and it is typed on this pad whenever a camera cannot
 * read the label. A field states its own `maxLength` and the pad honours it;
 * eight remains what a field that says nothing gets, because the fields that
 * say nothing are all still calorie totals and weights.
 */
const MAX_LENGTH = 8

/**
 * What the pad needs from the field it is driving, read fresh on every press.
 *
 * A ref rather than a value, and that is the whole trick of this file. The pad
 * is mounted once and outlives every keystroke, so a handler closed over the
 * value it was opened with would append the second digit to a number one digit
 * old. Writing through a ref means the pad always sees the field as it is now
 * without the field having to re-register on every change.
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
 * The pad is one component, but it cannot be drawn in one place. A `Sheet` is a
 * native modal window, and nothing rendered in the app's own tree can appear
 * over it — so a pad drawn at the root would be behind the sheet whose field
 * opened it. Every bottom-anchored container therefore hosts a pad, and the
 * NEAREST one draws: `Screen` for a page, `Sheet` for the panel over it.
 *
 * The empty string is "no host", which is what a field rendered outside both
 * gets. It opens nothing rather than opening a pad nobody can see.
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
   * Copy, passed in rather than translated here. The design system knows no
   * words: every other component in `src/ui` takes its labels the same way, and
   * this one is only different in that its caller is the root layout rather
   * than a screen.
   */
  labels: NumpadLabels
}

/**
 * The app's own number pad, and the state of whichever field is using it.
 *
 * It exists because the system one stopped being a keyboard we could lay out
 * against. A number pad has no return key, so iOS 26 floats a "Done" pill above
 * it — inside the keyboard frame the app is told about, while the keys are not.
 * Everything positioned against that frame therefore clears a control it cannot
 * see, and the strip it leaves behind shows the diary through it. Guessing the
 * pill's height would be guessing at a number Apple is free to change.
 *
 * So the app draws the pad. `showSoftInputOnFocus={false}` gives the field a
 * caret and no keyboard on both platforms (on iOS by handing UIKit an empty
 * input view), the pad is an ordinary view at the bottom of the window, and its
 * height is a constant this file owns. Nothing about the geometry is reported
 * by anybody any more.
 *
 * `keyboardType` stays on the fields regardless. It does nothing while the pad
 * is up, and it is what they fall back to if a future platform declines to
 * suppress the keyboard: a numeric keyboard in the wrong place beats a
 * QWERTY one.
 */
export function NumpadProvider({ children, labels }: NumpadProviderProps) {
  const insets = useSafeAreaInsets()
  const [session, setSession] = useState<Session | null>(null)
  /**
   * What the host actually draws, which lags `session` by one animation on the
   * way out. Unmounting on close would take the pad off screen in a frame and
   * leave the footer sliding down over nothing.
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
   * The open session, readable outside a render. `dismiss` needs it to blur the
   * field, and doing that from inside a state updater would be a side effect in
   * a function React is free to call twice.
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
    // Nothing open is the common case, not the edge one: `Screen` calls this on
    // every scroll that starts, the way `keyboardDismissMode` works, and almost
    // none of those have a pad up. Without this guard every drag anywhere in
    // the app would push a state update through the provider above the whole
    // tree.
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
   * The field's own limit, passed straight through from `TextField`'s
   * `maxLength`. It has to reach the pad because suppressing the system
   * keyboard also suppresses the platform's enforcement of it: with no
   * `TextInput` typing, a cap the input alone knows about caps nothing.
   */
  maxLength?: number
  /** The first key replaces the value. What `selectTextOnFocus` used to buy. */
  replaceFirst?: boolean
  /** Pass a field's own handlers through; this hook composes rather than replaces. */
  onFocus?: () => void
  onBlur?: () => void
  /**
   * Off leaves the field on the system keyboard, handlers and all. For a
   * component whose numeric-ness is a prop — `TextField` is either a name or an
   * amount depending on `keyboardType`, and a hook cannot be called
   * conditionally.
   */
  enabled?: boolean
}

/**
 * Turns a `TextInput` into a field the app's own pad drives.
 *
 * Spread the result LAST, after the caller's own props: it composes `onFocus`
 * and `onBlur` with whatever was passed in, and the composed pair has to be the
 * one that wins.
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
   * Loud, because the fallback is the bug this whole file exists to remove
   * wearing a disguise: the field quietly keeps the system keyboard, which for
   * a numeric one is the pad with the floating pill on it. It has already
   * happened once — the calorie total on a logged entry called this hook up in
   * the route, which RENDERS the screen rather than sitting inside it, so the
   * host `Screen` provides was nowhere above it.
   *
   * A warning rather than a throw: a field genuinely outside both containers
   * still works on the platform's keyboard, and crashing a screen over a
   * layout mistake is the worse trade.
   */
  useEffect(() => {
    if (!__DEV__ || !enabled || !context || hostId !== '') return
    console.warn(
      'useNumpadField: no <NumpadHost> above this field, so it is on the system keyboard. ' +
        'Render it inside a Screen or a Sheet rather than in the component that returns one.',
    )
  }, [enabled, context, hostId])

  /**
   * The two handlers, pulled out of the context value.
   *
   * They are stable where the context OBJECT is not — it carries the open
   * session, so its identity changes on every open, every close and every
   * keystroke that re-renders the provider. Depending on the object below
   * would make the unmount guard tear down and re-run on the very render that
   * opened the pad, and its cleanup closes: the pad appeared and vanished
   * inside one frame, which reads exactly like focus not working at all.
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
     * The caret lives at the end, because that is where the pad writes.
     *
     * Controlled only while the pad is driving the field. A controlled
     * selection is a fight with the platform's own caret handling and is worth
     * having exactly here, where the value cannot change by any route except
     * our own keys — a caret left in the middle of a number would point at a
     * place the next digit was never going to land.
     */
    selection: active ? { start: value.length, end: value.length } : undefined,
  }
}

export type NumpadHostProps = {
  children: ReactNode
  /**
   * This host's identity, from `useNumpadZone`.
   *
   * Passed in rather than minted here because the container around this element
   * also has to know how much room ITS OWN pad is taking, and it works that out
   * in its own render, above this element. One id, generated once, so the two
   * halves cannot disagree about whose pad is open. A host given none stands
   * alone: it draws for the fields under it and nothing gets out of its way.
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
 * somebody else.
 *
 * Renders no box of its own: the pad is absolutely positioned, so it lands
 * against the bottom of whatever view the host was placed in. That is `Screen`'s
 * shell for a page and `Sheet`'s scrim for a panel, both of which reach the
 * bottom of the window.
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
 * A pad host, and how much room ITS OWN pad is taking.
 *
 * The `id` pairs with the `NumpadHost` the caller renders, and the scoping is
 * the whole reason it exists. The provider holds ONE `offset` for the app, and
 * read directly it moves every container in the tree — including the ones that
 * are not drawing the pad and cannot see it.
 *
 * That is not the rare case it sounds like. A field keeps focus when you
 * navigate away from it: suppressing the system keyboard also removes the
 * reason the platform had to resign first responder, so nothing blurs, the
 * session stays open, and the screen it belongs to is still mounted somewhere
 * under the one you are looking at. Every footer and every floating action
 * mounted after it then sat the pad's full height off the bottom of the screen,
 * with a screen of canvas underneath. Onboarding's weight field is the first
 * numeric field a new user meets, which is why the symptom was a log button and
 * a paywall button floating a third of the way up the app on first open.
 *
 * `height` is 0 unless this host's pad is open, so a caller can add it to a
 * padding without a conditional. `offset` is the animated twin, for the UI
 * thread, and it follows `shown` as well as `session` because `shown` lags by
 * one animation on the way out — scoped to the session alone, a host would let
 * go of the offset on the frame the pad started sliding away and its footer
 * would snap down instead of riding it.
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
   * asked for `replaceFirst`. It is a ref rather than state because nothing on
   * screen depends on it — re-rendering the pad on the first digit would be a
   * frame of work for no pixels.
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
   * THE WORKLET TAKES TWO NUMBERS, NOT THE CONTEXT.
   *
   * This looks like a pointless destructure and it is the difference between
   * the pad working and the pad silently refusing to type a second digit.
   *
   * Reanimated FREEZES every object a worklet closes over, so that the UI
   * thread can read it without tearing. Written as
   * `context.height - context.offset.value` the worklet captures `context` —
   * and `context` holds `session`, which holds the `field` REF that
   * `useNumpadField` writes the live value into on every render. Frozen, that
   * write does nothing at all: `field.current = {...}` is a no-op, the pad goes
   * on reading the value the field had when it was first focused, and every key
   * appends to it. Which is to say every key REPLACES what came before, because
   * the value it appends to is the empty string for ever.
   *
   * The symptom is that "1" then "2" leaves a field reading "2" — a calorie
   * total, a weight or a barcode that cannot be typed. In dev Reanimated says so
   * ("Tried to modify key `current` of an object which has been already passed
   * to a worklet"); in a release build it is silent.
   *
   * So: read the two values out here, on the JS thread, and let the worklet
   * capture a number and a shared value. Nothing reachable from them owns any
   * state anybody writes to.
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
