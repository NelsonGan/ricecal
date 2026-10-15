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
  useSyncExternalStore,
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
/** The quick-add row a set's field adds above the digits. See `NumpadTools`. */
const QUICK_HEIGHT = 40
const QUICK_BOX = 'h-[40px]'

/** What the pad occupies above the home indicator's inset. */
export const NUMPAD_BODY_HEIGHT =
  PANEL_PAD * 2 + HEADER_HEIGHT + KEY_GAP + KEY_HEIGHT * 4 + KEY_GAP * 3

/** The same, for a field that asked for quick-add keys. */
const bodyHeight = (tools: NumpadTools | undefined) =>
  NUMPAD_BODY_HEIGHT + (tools?.quick?.length ? QUICK_HEIGHT + KEY_GAP : 0)

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
  /** A column of extra keys, for a field that is one of many. See `NumpadTools`. */
  tools?: NumpadTools
}

/**
 * The keys a run of fields needs and a lone field does not: the set logger's.
 *
 * Laid out the way Strong and Hevy lay theirs out. A row of quick-add keys over
 * the digits, because a set is usually changed a plate or a quarter-minute at a
 * time and should not have to be retyped for it. Arrows in the header to walk
 * the fields and a chevron to put the pad away. A fourth column of Clear, a
 * tick for the set, and Next, which is how a set is filled in, weight then
 * reps then the next set, without reaching up the screen for each field.
 *
 * Everything is the field's to say, and read fresh on every press like the rest
 * of the spec.
 */
export type NumpadTools = {
  /** "−2.5", "+2.5", "+5", "+0:30". A quick key's value is a finished one. */
  quick?: readonly NumpadKey[]
  /** "Next", or "Done" on the last field there is. */
  next?: NumpadKey
  /** The field before this one, for the header's up arrow. */
  previous?: NumpadKey
  /** Ticks the set the field belongs to: "✓ Set". */
  complete?: NumpadKey
  /** A shortcut in the header, beside the label: the plate calculator for a barbell. */
  accessory?: NumpadKey
}

export type NumpadKey = {
  label: string
  onPress: () => void
  /** For a screen reader, where the label alone ("+5") does not say of what. */
  accessibilityLabel?: string
}

type Session = {
  /** Which `NumpadHost` draws the pad. See `NumpadHost` for why this is needed. */
  hostId: string
  field: { current: NumpadFieldSpec }
  /** Ends the edit the way tapping away from a keyboard does: through blur. */
  blur: () => void
  /** Where the field is on screen, so a host can scroll it clear of the pad. */
  measure: (report: (top: number, height: number) => void) => void
  /**
   * Whether the next key replaces the value, which the field draws as the
   * whole value selected. The pad says so after each key and each step.
   */
  setFresh: (fresh: boolean) => void
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
 * The half of the pad a field needs, which never changes identity. A field
 * only has to know whether it is the one being edited, so it subscribes to
 * that one boolean rather than to `NumpadValue`, which changes on every open,
 * close and Next: through the value, every set row in a workout re-rendered
 * each time the pad moved between two of them.
 */
type NumpadActions = Pick<NumpadValue, 'open' | 'close' | 'dismiss'> & {
  current: () => Session | null
  subscribe: (listener: () => void) => () => void
}

const ActionsContext = createContext<NumpadActions | null>(null)

const noSubscription = () => () => {}

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
  /** The key that empties a set's field. */
  clear: string
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

  // Read off the field, since a set's field draws a row more than any other.
  const height = bodyHeight(session?.field.current.tools) + insets.bottom
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
   * The open session, the source of truth: `session` is its copy for rendering.
   * Readable outside a render, which `dismiss` needs to blur the field (from a
   * state updater that would be a side effect React is free to run twice), and
   * which lets a field ask "is it me?" without rendering on every change.
   */
  const current = useRef<Session | null>(null)
  const listeners = useRef(new Set<() => void>())

  const actions = useMemo<NumpadActions>(() => {
    const set = (next: Session | null) => {
      current.current = next
      setSession(next)
      for (const listener of listeners.current) listener()
    }
    return {
      current: () => current.current,
      subscribe: (listener) => {
        listeners.current.add(listener)
        return () => {
          listeners.current.delete(listener)
        }
      },
      open: set,
      // Identity-checked, because blur arrives AFTER the next field's focus when
      // a tap moves from one field to another. Closing unconditionally would
      // take the pad down on the field that had just opened it.
      close: (which) => {
        if (current.current === which) set(null)
      },
      dismiss: () => {
        // Nothing open is the common case: `Screen` calls this on every scroll
        // that starts, and almost none have a pad up. Without the guard, every
        // drag in the app pushes a state update through the provider above the
        // whole tree.
        if (!current.current) return
        // Blur first: the field's own `onBlur` is what commits the number, and
        // every caller hangs its commit there rather than on a key. Closing
        // without it would take the pad away and leave the value uncommitted.
        current.current.blur()
        set(null)
      },
    }
  }, [])

  const value = useMemo<NumpadValue>(
    () => ({
      session,
      shown,
      height,
      offset,
      labels,
      open: actions.open,
      close: actions.close,
      dismiss: actions.dismiss,
    }),
    [session, shown, height, offset, labels, actions],
  )

  return (
    <ActionsContext.Provider value={actions}>
      <NumpadContext.Provider value={value}>{children}</NumpadContext.Provider>
    </ActionsContext.Provider>
  )
}

/**
 * Whether the pad is up anywhere. For something that floats at the bottom of
 * the window over every screen, the toast, which would otherwise land on the
 * keys a moment after a tick and take the next tap.
 */
export function useNumpadOpen(): boolean {
  const actions = useContext(ActionsContext)
  return useSyncExternalStore(actions?.subscribe ?? noSubscription, () =>
    Boolean(actions?.current()),
  )
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
  /** Extra keys for a field that is one of a run of them. See `NumpadTools`. */
  tools?: NumpadTools
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
  tools,
  onFocus,
  onBlur,
  enabled = true,
  returnKeyType,
}: NumpadFieldOptions) {
  const actions = useContext(ActionsContext)
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
    tools,
  })
  field.current = { value, onChangeText, decimal, label, maxLength, replaceFirst, tools }

  // One session object for the life of the field, so `close` can tell whether
  // the pad it is being asked to shut is still this field's.
  const session = useRef<Session | null>(null)
  const [fresh, setFresh] = useState(false)
  if (!session.current) {
    session.current = {
      hostId,
      field,
      blur: () => input.current?.blur(),
      measure: (report) => input.current?.measureInWindow((_x, y, _w, h) => report(y, h)),
      setFresh,
    }
  }
  session.current.hostId = hostId

  const live = enabled && Boolean(actions) && hostId !== ''

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
    if (!__DEV__ || !enabled || !actions || hostId !== '') return
    console.warn(
      'useNumpadField: no <NumpadHost> above this field, so it is on the system keyboard. ' +
        'Render it inside a Screen or a Sheet rather than in the component that returns one.',
    )
  }, [enabled, actions, hostId])

  const openPad = actions?.open
  const closePad = actions?.close

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
    setFresh(replaceFirst)
    onFocus?.()
  }, [live, openPad, onFocus, replaceFirst])

  const handleBlur = useCallback(() => {
    if (session.current) closePad?.(session.current)
    onBlur?.()
  }, [closePad, onBlur])

  const active = useSyncExternalStore(
    actions?.subscribe ?? noSubscription,
    () => live && actions?.current() === session.current,
  )

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
     * The caret lives at the end, where the pad writes, or the whole value is
     * selected while the next key would replace it: a weight opened for editing
     * reads as "type to replace", the way a field with `selectTextOnFocus` does.
     * Controlled only while the pad is driving: a controlled selection fights
     * the platform's own caret handling, and is worth it only where the value
     * changes by no other route.
     */
    selection: active
      ? { start: fresh && replaceFirst ? 0 : value.length, end: value.length }
      : undefined,
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
  const tools = spec.tools
  const [title, detail] = (spec.label ?? '').split('\n')
  const heading = { title, detail }

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
      session.setFresh(false)

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

  // A quick-added value is a finished one: the next digit starts a new number
  // rather than growing "75" into "758".
  const quick = useCallback(
    (key: NumpadKey) => {
      key.onPress()
      pristine.current = true
      session.setFresh(session.field.current.replaceFirst)
    },
    [session],
  )

  const clear = useCallback(() => {
    session.field.current.onChangeText('')
    pristine.current = false
    session.setFresh(false)
  }, [session])

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
        className="flex-row items-center gap-1.5"
        style={{ height: HEADER_HEIGHT, marginBottom: KEY_GAP }}
      >
        {/* A label with a line break is a name over a detail: the exercise,
            then the set and unit, so neither is cut off by the keys beside it. */}
        <View className="min-w-0 flex-1">
          {heading.detail ? (
            <Text variant="caption" numberOfLines={1}>
              {heading.title}
            </Text>
          ) : null}
          <Text variant="label" numberOfLines={1}>
            {heading.detail ?? heading.title}
          </Text>
        </View>
        {tools?.accessory ? (
          <Tappable
            className="h-[34px] justify-center rounded-full bg-surface px-3"
            onPress={() => session.field.current.tools?.accessory?.onPress()}
            accessibilityRole="button"
            accessibilityLabel={tools.accessory.label}
          >
            <Text variant="label" className="text-pandan-ink">
              {tools.accessory.label}
            </Text>
          </Tappable>
        ) : null}
        {tools ? (
          <>
            <HeaderKey
              icon="arrow-up"
              disabled={!tools.previous}
              onPress={() => session.field.current.tools?.previous?.onPress()}
              accessibilityLabel={tools.previous?.label ?? ''}
            />
            <HeaderKey
              icon="arrow-down"
              disabled={!tools.next}
              onPress={() => session.field.current.tools?.next?.onPress()}
              accessibilityLabel={tools.next?.label ?? ''}
            />
            <HeaderKey
              icon="chevron-down"
              onPress={context.dismiss}
              accessibilityLabel={context.labels.done}
            />
          </>
        ) : (
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
        )}
      </View>

      {tools?.quick?.length ? (
        <View className="flex-row" style={{ gap: KEY_GAP, marginBottom: KEY_GAP }}>
          {tools.quick.map((key, index) => (
            <Squish
              // biome-ignore lint/suspicious/noArrayIndexKey: the row's order is the field's
              key={index}
              containerClassName={cn('flex-1', QUICK_BOX)}
              className="flex-1 items-center justify-center bg-pandan-soft"
              slabClassName="bg-pandan-soft-line"
              depth={slab.sm}
              radius={radius.sm}
              onPress={() => {
                const live = session.field.current.tools?.quick?.[index]
                if (live) quick(live)
              }}
              accessibilityRole="button"
              accessibilityLabel={key.accessibilityLabel ?? key.label}
            >
              <Text
                className="font-display text-[16px] leading-[21px] text-pandan-ink"
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {key.label}
              </Text>
            </Squish>
          ))}
        </View>
      ) : null}

      <View className="flex-row" style={{ gap: KEY_GAP }}>
        <View className="flex-[3]" style={{ gap: KEY_GAP }}>
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
                      // Keep Baloo 2's full glyph box inside the key. A tighter
                      // implicit leading clipped the digits on newer iOS.
                      <Text className="font-display text-[24px] leading-[29px] text-heading">
                        {key}
                      </Text>
                    )}
                  </Squish>
                )
              })}
            </View>
          ))}
        </View>
        {tools ? (
          <View className="flex-[1.3]" style={{ gap: KEY_GAP }}>
            <ToolKey onPress={clear} accessibilityLabel={context.labels.clear}>
              <Text className="font-display text-[16px] leading-[21px] text-muted">
                {context.labels.clear}
              </Text>
            </ToolKey>
            {tools.complete ? (
              <ToolKey
                tone="pandan"
                onPress={() => session.field.current.tools?.complete?.onPress()}
                accessibilityLabel={tools.complete.accessibilityLabel ?? tools.complete.label}
              >
                <View className="flex-row items-center gap-1">
                  <Icon set="ui" name="check" size={16} tintColor={colors.pandanInk} />
                  <Text className="font-display text-[16px] leading-[21px] text-pandan-ink">
                    {tools.complete.label}
                  </Text>
                </View>
              </ToolKey>
            ) : (
              <View className={KEY_BOX} />
            )}
            {/* Two keys tall, as Strong draws its own: it is the key pressed most. */}
            <Squish
              containerClassName="flex-1"
              className="flex-1 items-center justify-center bg-pandan"
              slabClassName="bg-pandan-slab"
              depth={slab.sm}
              radius={radius.sm}
              onPress={() => {
                const live = session.field.current.tools?.next
                if (live) live.onPress()
                else context.dismiss()
              }}
              accessibilityRole="button"
              accessibilityLabel={tools.next?.label ?? context.labels.done}
            >
              <Text className="font-display text-[18px] leading-[23px] text-on-pandan">
                {tools.next?.label ?? context.labels.done}
              </Text>
            </Squish>
          </View>
        ) : null}
      </View>
    </Animated.View>
  )
}

/** A small key in the header: the field arrows and the keyboard-hide. */
function HeaderKey({
  icon,
  disabled = false,
  onPress,
  accessibilityLabel,
}: {
  /** The field arrows, or the chevron that puts the pad away. */
  icon: 'arrow-up' | 'arrow-down' | 'chevron-down'
  disabled?: boolean
  onPress: () => void
  accessibilityLabel: string
}) {
  const colors = useThemeColors()
  return (
    <Tappable
      className={cn(
        'h-[34px] w-[38px] items-center justify-center rounded-sm bg-surface',
        disabled && 'opacity-40',
      )}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel}
    >
      <Icon
        set="ui"
        name={icon}
        size={18}
        tintColor={icon === 'chevron-down' ? colors.pandanInk : colors.muted}
      />
    </Tappable>
  )
}

/** A key in the tools column: the same slab as a digit, tinted to read as a tool. */
function ToolKey({
  tone = 'neutral',
  onPress,
  accessibilityLabel,
  children,
}: {
  tone?: 'neutral' | 'pandan'
  onPress: () => void
  accessibilityLabel: string
  children: ReactNode
}) {
  return (
    <Squish
      containerClassName={KEY_BOX}
      className={cn(
        'flex-1 items-center justify-center',
        tone === 'pandan' ? 'bg-pandan-soft' : 'bg-surface',
      )}
      slabClassName={tone === 'pandan' ? 'bg-pandan-soft-line' : 'bg-line'}
      depth={slab.sm}
      radius={radius.sm}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Squish>
  )
}
