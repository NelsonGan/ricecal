import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
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
  /** Milliseconds on screen. Defaults to 6s, or 8s when there is an action. */
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
  const insets = useSafeAreaInsets()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextId = useRef(0)

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
      timer.current = setTimeout(dismiss, options.duration ?? (options.action ? 8000 : 6000))
    },
    [clear, dismiss],
  )

  // A pending timer holding a setState after unmount is a warning at best and a
  // leak at worst.
  useEffect(() => clear, [clear])

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])
  const palette = tones[toast?.tone ?? 'neutral']
  const placement = toast?.placement ?? (toast?.tone === 'error' ? 'top' : 'bottom')
  const fromTop = placement === 'top'

  return (
    <ToastContext.Provider value={value}>
      {children}

      {toast ? (
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
      ) : null}
    </ToastContext.Provider>
  )
}
