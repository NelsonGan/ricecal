import { ImpactFeedbackStyle, impactAsync } from 'expo-haptics'
import type { ReactNode, Ref } from 'react'
import { Pressable, type PressableProps, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { radius, slab } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Icon, type IconProps } from './Icon'
import { Squish } from './Squish'
import { Text } from './Text'

/**
 * How much of the bottom of the screen the bar occupies, safe area aside.
 *
 * Exported so a floating element — the toast — can clear it without measuring,
 * which would otherwise mean a layout pass before it could animate in.
 */
export const NAV_BAR_HEIGHT = 96

export type NavTab<T extends string> = {
  value: T
  label: string
  icon: IconProps
}

/**
 * The bar itself: safe-area padding, the surface pill, and the row.
 *
 * Exported separately from `BottomNav` because a router-driven tab bar has to
 * interleave its own trigger components with the FAB, which a fully controlled
 * component cannot express. Both paths render the same three pieces, so there
 * is one place to change the bar's look.
 */
export function NavBar({ children, className }: { children: ReactNode; className?: string }) {
  const insets = useSafeAreaInsets()

  return (
    <View
      className={cn('bg-canvas px-gutter pt-2', className)}
      style={{ paddingBottom: insets.bottom || 12 }}
      accessibilityRole="tablist"
    >
      <View className="flex-row items-center justify-between gap-2 rounded-card bg-surface px-4 py-3">
        {children}
      </View>
    </View>
  )
}

export type NavItemProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string
  icon: IconProps
  /**
   * Whether this tab is the active one. Named to match what expo-router's
   * `TabTrigger` injects when used with `asChild`, so no adapter is needed.
   */
  isFocused?: boolean
  /** Also injected by `TabTrigger`. Web only, and never rendered natively. */
  href?: string
  /**
   * Accepted so a `TabTrigger` slot can pass its own row layout in, and then
   * dropped — the bar's layout belongs to the design system, and forwarding it
   * would flip this column back to a row.
   */
  style?: unknown
  ref?: Ref<View>
}

/** One tab in the bar. Sized to fill its share of the row. */
export function NavItem({
  label,
  icon,
  isFocused = false,
  href,
  style,
  onPressIn,
  ...rest
}: NavItemProps) {
  const colors = useThemeColors()

  return (
    <Pressable
      {...rest}
      onPressIn={(event) => {
        /**
         * A tab was the one thing in the bar with no physical answer.
         *
         * Every squishy control already does this through `Squish`; a tab is a
         * plain `Pressable`, so it was the only tap in the app that moved the
         * whole screen and felt like nothing. Same weight and same timing as
         * `Squish` — Light, on press IN, because feedback that waits for the
         * release arrives after the screen has already changed.
         *
         * Fire and forget: haptics are unavailable on a simulator and on a phone
         * with system feedback turned off, and neither is a reason to fail a
         * navigation.
         */
        void impactAsync(ImpactFeedbackStyle.Light).catch(() => {})
        onPressIn?.(event)
      }}
      className="min-w-0 flex-1 items-center gap-1.5 py-1"
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={label}
    >
      {/* An inactive tab is grey, and the tint goes through `style` rather than
          through `tintColor`.
          `expo-image` documents both, but only the style reliably reaches the
          view here — sizing arrives the same way and demonstrably works, while
          the prop left these illustrations in full colour when unfocused. */}
      <Icon
        {...icon}
        size={26}
        style={isFocused ? undefined : { tintColor: colors.faint }}
        tintColor={isFocused ? undefined : colors.faint}
      />
      <Text variant="caption" className={isFocused ? 'text-pandan-ink' : 'text-faint'}>
        {label}
      </Text>
    </Pressable>
  )
}

export type NavActionProps = {
  onPress: () => void
  label: string
  className?: string
}

/**
 * The raised centre action.
 *
 * The negative margin lifts it above the bar's top edge, which only shows
 * because `NavBar` sets no overflow clipping. This is the one element in the
 * system allowed to break a container edge.
 */
export function NavAction({ onPress, label, className }: NavActionProps) {
  return (
    <Squish
      depth={slab.lg}
      radius={radius.tile}
      containerClassName="-mt-[26px]"
      slabClassName="bg-pandan-slab"
      className={cn('h-[62px] w-[62px] items-center justify-center bg-pandan', className)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text className="font-display text-[32px] leading-[38px] text-on-pandan">+</Text>
    </Squish>
  )
}

export type BottomNavProps<T extends string> = {
  /** Exactly four. The FAB sits between the second and third. */
  tabs: readonly [NavTab<T>, NavTab<T>, NavTab<T>, NavTab<T>]
  value: T
  onChange: (value: T) => void
  /** The raised centre action. Omit to render four plain tabs. */
  onPressAction?: () => void
  actionLabel?: string
  className?: string
}

/**
 * The bottom tab bar, fully controlled.
 *
 * The tab tuple is typed as exactly four because the FAB is positioned by
 * splitting the array in half. Five tabs would put it off-centre, and the type
 * says so rather than leaving it to be discovered on screen.
 *
 * Screens driven by the router use `NavBar` / `NavItem` / `NavAction` directly
 * instead, since their trigger components have to be the row's own children.
 */
export function BottomNav<T extends string>({
  tabs,
  value,
  onChange,
  onPressAction,
  actionLabel = 'Add',
  className,
}: BottomNavProps<T>) {
  const [left, right] = [tabs.slice(0, 2), tabs.slice(2)]

  const renderTab = (tab: NavTab<T>) => (
    <NavItem
      key={tab.value}
      label={tab.label}
      icon={tab.icon}
      isFocused={tab.value === value}
      onPress={() => onChange(tab.value)}
    />
  )

  return (
    <NavBar className={className}>
      {left.map(renderTab)}
      {onPressAction ? <NavAction onPress={onPressAction} label={actionLabel} /> : null}
      {right.map(renderTab)}
    </NavBar>
  )
}
