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
import { View } from 'react-native'
import Animated, { SlideInDown, SlideInUp, SlideOutDown, SlideOutUp } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { spacing } from '@/theme/tokens'
import { cn } from './cn'
import { Icon, type IconProps } from './Icon'
import { Tappable } from './Tappable'
import { Text } from './Text'

export type ToastTone = 'neutral' | 'success' | 'warning' | 'error'

/**
 * Which edge a toast comes from.
 *
 * Errors default to the top, everything else to the bottom, and the reason is
 * the keyboard. An error is nearly always the answer to a form submission, so it
 * arrives with the keyboard up — and the bottom of the screen is precisely where
 * the keyboard is. A confirmation or an undo comes from tapping a row, where the
 * bottom is both free and closer to the thumb.
 */
export type ToastPlacement = 'top' | 'bottom'

export type ToastOptions = {
  title: string
  description?: string
  tone?: ToastTone
  /** An inline action, e.g. { label: 'Undo', onPress }. */
  action?: { label: string; onPress: () => void }
  icon?: IconProps
  /** Milliseconds on screen. Defaults to 4s, or 3.5s when there is an action. */
  duration?: number
  /** Overrides the tone's default edge. Rarely needed. */
  placement?: ToastPlacement
}

type Toast = ToastOptions & { id: number }

/**
 * What `useToast` hands back.
 *
 * Exported because a couple of things that are not components need to show a
 * toast — a refusal read off the wire, for one — and taking the api as an
 * argument is how they do it without reaching for the context themselves.
 */
export type ToastApi = {
  show: (options: ToastOptions) => void
  dismiss: () => void
}

const ToastContext = createContext<ToastApi | null>(null)

/**
 * Fire a toast from anywhere under the provider.
 *
 * Throws rather than no-ops when the provider is missing. A toast that silently
 * never appears is the kind of bug that survives to production, because the
 * happy path looks identical.
 */
export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}

const tones = {
  neutral: { fill: 'bg-inverse', title: 'text-on-inverse', body: 'text-on-inverse opacity-70' },
  success: { fill: 'bg-inverse', title: 'text-on-inverse', body: 'text-on-inverse opacity-70' },
  warning: { fill: 'bg-kaya', title: 'text-on-kaya', body: 'text-on-kaya opacity-70' },
  error: { fill: 'bg-hibiscus', title: 'text-on-hibiscus', body: 'text-on-hibiscus opacity-80' },
} as const

/**
 * What an outlet needs to draw, and the register of who is drawing.
 *
 * Separate from `ToastApi` on purpose: `useToast` is the app-facing half and has
 * exactly two methods on it, while this is plumbing that only `ToastHost` and
 * the provider's own outlet read.
 */
type ToastStage = {
  toast: Toast | null
  dismiss: () => void
  claim: (id: string) => () => void
  /** The outlet drawing right now, or null for the provider's own. */
  drawing: string | null
  offset: number
}

const ToastStage = createContext<ToastStage | null>(null)

export type ToastProviderProps = {
  children: ReactNode
  /**
   * Extra bottom offset in points. Set this to the height of a tab bar or a
   * footer CTA — the design rule is that a toast never covers the log button.
   */
  offset?: number
}

/**
 * Renders at most one toast at a time, above everything else in the tree.
 *
 * One at a time on purpose: a stack of toasts covers the screen it is reporting
 * on, and the newest message is nearly always the one that matters. Showing a
 * second replaces the first and restarts the timer.
 */
export function ToastProvider({ children, offset = 0 }: ToastProviderProps) {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextId = useRef(0)

  /**
   * The outlets that have offered to draw, oldest first. Only the last one does.
   *
   * State rather than a ref, because whether this provider draws its own outlet
   * has to be decided in a render — and the answer changes when a sheet opens.
   */
  const [hosts, setHosts] = useState<string[]>([])
  const claim = useCallback((id: string) => {
    setHosts((current) => [...current, id])
    return () => setHosts((current) => current.filter((host) => host !== id))
  }, [])

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const dismiss = useCallback(() => {
    clear()
    setToast(null)
  }, [clear])

  const show = useCallback(
    (options: ToastOptions) => {
      clear()
      nextId.current += 1
      setToast({ ...options, id: nextId.current })
      /**
       * SHORTER WITH AN ACTION THAN WITHOUT, which is the opposite of what it
       * was and of what it looks like it should be.
       *
       * The reasoning for eight seconds was that an offer needs longer than a
       * statement, because it has to be read AND acted on. What that missed is
       * where the offer sits: an undo is a bar across the bottom of the screen,
       * over the diary and the tab bar, and every second of it is a second the
       * app is partly covered. And the decision behind it is not a slow one —
       * somebody who has just logged a meal or a drink knows immediately
       * whether they meant to. Eight seconds stopped reading as a chance to
       * take it back and started reading as something in the way.
       *
       * SIX AND FOUR AND A HALF WENT THE SAME WAY, for the same reason carried
       * one step further. Every toast in this app is one short sentence, and a
       * sentence is read in about a second — the rest of the time is a bar the
       * user has already finished with, sitting over the screen they are trying
       * to use. It is worst where the toast is followed somewhere: a refusal
       * says what happened and pushes the paywall underneath it, so six seconds
       * of it lay across the top of a screen the user had been taken to.
       */
      timer.current = setTimeout(dismiss, options.duration ?? (options.action ? 3500 : 4000))
    },
    [clear, dismiss],
  )

  // A pending timer holding a setState after unmount is a warning at best and a
  // leak at worst.
  useEffect(() => clear, [clear])

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])
  const stage = useMemo(
    () => ({ toast, dismiss, claim, drawing: hosts[hosts.length - 1] ?? null, offset }),
    [toast, dismiss, claim, hosts, offset],
  )

  return (
    <ToastContext.Provider value={value}>
      <ToastStage.Provider value={stage}>
        {children}
        {/* The provider draws it only when nothing above it has claimed the
            job. See `ToastHost`. */}
        {stage.drawing === null ? <ToastSurface stage={stage} offset={offset} /> : null}
      </ToastStage.Provider>
    </ToastContext.Provider>
  )
}

/**
 * WHY A TOAST NEEDS A HOST AT ALL, when it is already at the top of the tree.
 *
 * Because the top of the REACT tree is not the top of the screen. A sheet is
 * presented as a native modal — `Sheet`'s own `Modal`, or a route the navigator
 * presents as a `transparentModal` — and a native modal is its own window,
 * above the app's root view. Nothing rendered in the app tree can draw over it,
 * which is the same rule `NumpadHost` exists for and the same fix.
 *
 * The symptom was invisible rather than broken, which is why it lasted: the
 * toast mounted, took its place in the accessibility tree, ran its timer and
 * dismissed itself, all underneath the panel. Every message the log sheet has
 * to give without navigating away went that way — the plan still being checked,
 * the subscription that could not be looked up, a purchase still confirming,
 * and a subscriber told they had reached fifty scans. Each of them read as a
 * button that did nothing.
 *
 * THE TOPMOST HOST WINS, and the provider's own outlet is the bottom of that
 * stack. Registration is by mount order, so the last sheet to open is the one
 * that draws, and closing it hands the job back to whatever is underneath.
 */
export type ToastHostProps = {
  /** Extra bottom room, for an outlet that has a tab bar or a CTA under it. */
  offset?: number
  /**
   * Overrides the edge every toast in this outlet comes from.
   *
   * `Sheet` pins it to `top`, and that is the whole reason this exists. A toast
   * defaults to the bottom, and the bottom of the screen is exactly where a
   * sheet's panel and its buttons are — so the first message that arrived over
   * a sheet landed across the two controls it was asking about. The top of a
   * sheet is scrim, which is the one part of that screen nothing is using.
   */
  placement?: ToastPlacement
}

export function ToastHost({ offset = 0, placement }: ToastHostProps) {
  const id = useId()
  const stage = useContext(ToastStage)
  const claim = stage?.claim

  useEffect(() => claim?.(id), [claim, id])

  if (!stage || stage.drawing !== id) return null
  return <ToastSurface stage={stage} offset={offset} placement={placement} />
}

function ToastSurface({
  stage,
  offset,
  placement: forced,
}: {
  stage: ToastStage
  offset: number
  placement?: ToastPlacement
}) {
  const insets = useSafeAreaInsets()
  const { toast, dismiss } = stage
  const palette = tones[toast?.tone ?? 'neutral']
  const placement = forced ?? toast?.placement ?? (toast?.tone === 'error' ? 'top' : 'bottom')
  const fromTop = placement === 'top'

  if (!toast) return null

  return (
    <View
      className={cn('absolute inset-x-0 px-gutter', fromTop ? 'top-0' : 'bottom-0')}
      style={
        fromTop
          ? // No `offset` at the top. It exists to clear a tab bar or a footer
            // CTA, both of which are at the bottom by definition.
            { paddingTop: insets.top + spacing.md }
          : { paddingBottom: insets.bottom + spacing.md + offset }
      }
      pointerEvents="box-none"
    >
      <Animated.View
        // Keyed by id so replacing a toast replays the entrance rather than
        // silently swapping the text of one already on screen.
        key={toast.id}
        entering={fromTop ? SlideInUp.duration(280) : SlideInDown.duration(280)}
        exiting={fromTop ? SlideOutUp.duration(200) : SlideOutDown.duration(200)}
        className={cn('flex-row items-center gap-md rounded-md p-lg', palette.fill)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        {toast.icon ? <Icon {...toast.icon} size={24} /> : null}

        <View className="flex-1 gap-0.5">
          <Text className={cn('font-body-black text-[16px] leading-[20px]', palette.title)}>
            {toast.title}
          </Text>
          {toast.description ? (
            <Text className={cn('font-body-bold text-[14px] leading-[18px]', palette.body)}>
              {toast.description}
            </Text>
          ) : null}
        </View>

        {toast.action ? (
          <Tappable
            onPress={() => {
              toast.action?.onPress()
              dismiss()
            }}
            hitSlop={10}
            accessibilityRole="button"
          >
            <Text className="font-display text-[16px] leading-[20px] text-inverse-accent">
              {toast.action.label}
            </Text>
          </Tappable>
        ) : null}
      </Animated.View>
    </View>
  )
}
