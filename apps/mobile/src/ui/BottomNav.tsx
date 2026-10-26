import { createContext, type ReactNode, type Ref, useContext } from 'react'
import { View, type ViewInstance } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { radius, slab } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { CountBadge } from './Badge'
import { cn } from './cn'
import { Icon, type IconProps } from './Icon'
import { Squish } from './Squish'
import { Tappable, type TappableProps } from './Tappable'
import { Text } from './Text'

/**
 * How much of the bottom of the screen the bar occupies, safe area aside: the
 * pill, and nothing else.
 *
 * Each tab is 71pt high, plus the pill's borders. Single-line captions fit
 * within that height even when the phone uses larger text.
 *
 * Exported so a floating element — the toast — can clear the bar without
 * measuring, which would otherwise mean a layout pass before it could animate in.
 */
export const NAV_BAR_HEIGHT = 73

/**
 * How much of the bottom of a tab screen the floating bar covers, safe area
 * included. Zero outside the tabs, which is every pushed page.
 *
 * The bar floats over the screen rather than standing below it, so a screen
 * cannot just stop where the bar begins: `Screen` reads this to pad its last row
 * clear of the bar and to lift its floating corners above it.
 */
const NavInsetContext = createContext(0)
export const NavInsetProvider = NavInsetContext.Provider
export const useNavInset = () => useContext(NavInsetContext)

/** The bar's height including its bottom padding, for `NavInsetProvider`. */
export function useNavBarFootprint(): number {
  const insets = useSafeAreaInsets()
  return NAV_BAR_HEIGHT + (insets.bottom || 12)
}

export type NavTab<T extends string> = {
  value: T
  label: string
  icon: IconProps
}

/**
 * The bar itself: safe-area padding, the surface pill holding the tabs, and an
 * optional action beside it on the right. Exported separately from `BottomNav`,
 * because a router-driven tab bar has to make its own trigger components the
 * pill's direct children, which a controlled component cannot express.
 *
 * The app's tabs pass no action, so the pill spans the width of the screen and
 * five tabs get the room. The add button floats over Today instead, as
 * `Screen`'s `floatingTrailing`, which pads the day's last row clear of it.
 */
export function NavBar({
  children,
  action,
  className,
}: {
  children: ReactNode
  /** Drawn to the right of the pill. See `NavAction`. */
  action?: ReactNode
  className?: string
}) {
  const insets = useSafeAreaInsets()

  return (
    // FLOATING: over the bottom of the screen with no background of its own, so
    // the content scrolls on under the pill and the action. `Screen` pads the
    // last row clear of it; see `useNavInset`. `box-none` so the strip of
    // screen either side of the pill still takes touches.
    <View
      className={cn(
        'absolute inset-x-0 bottom-0 flex-row items-center gap-2.5 px-gutter',
        className,
      )}
      style={{ paddingBottom: insets.bottom || 12 }}
      pointerEvents="box-none"
    >
      {/* The tabs size this row: each carries its own vertical padding, so the
          pill is exactly the height of a tab column. The shadow is what lifts
          it off a card scrolling underneath. */}
      <View
        className="min-w-0 flex-1 flex-row items-center justify-between gap-1 rounded-card border border-line bg-surface px-2"
        style={FLOAT_SHADOW}
        accessibilityRole="tablist"
      >
        {children}
      </View>
      {action}
    </View>
  )
}

/** The lift of anything floating over the screen with the bar, so the two read as one layer. */
export const FLOAT_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 8,
} as const

export type NavItemProps = Omit<TappableProps, 'children' | 'style'> & {
  label: string
  icon: IconProps
  /** A red count over the icon, for something waiting on this tab. */
  badge?: number
  /** What the count is of, read out with it: "Groups, Invites 2" rather than "Groups, 2". */
  badgeLabel?: string
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
  ref?: Ref<ViewInstance>
}

/** One tab in the bar. Sized to fill its share of the row. */
export function NavItem({
  label,
  icon,
  badge = 0,
  badgeLabel,
  isFocused = false,
  href,
  style,
  ...rest
}: NavItemProps) {
  const colors = useThemeColors()

  return (
    // `Tappable`, so a tab answers a tap in the hand like every other control.
    // As a plain `Pressable` it was the only tap in the app that moved the whole
    // screen and felt like nothing.
    <Tappable
      {...rest}
      // Keep the measured footprint stable. Captions can grow within it, while
      // the full label remains available to a screen reader.
      className="h-[71px] min-w-0 flex-1 items-center justify-center gap-1.5"
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={
        badge > 0 ? [label, [badgeLabel, badge].filter(Boolean).join(' ')].join(', ') : label
      }
    >
      {/* An inactive tab is grey, and the tint goes through `style` rather than
          through `tintColor`. `expo-image` documents both, but only the style
          reliably reaches the view here — sizing arrives the same way and
          demonstrably works, while the prop left these illustrations in full
          colour when unfocused. */}
      <View>
        <Icon
          {...icon}
          size={26}
          style={isFocused ? undefined : { tintColor: colors.faint }}
          tintColor={isFocused ? undefined : colors.faint}
        />
        <CountBadge
          count={badge}
          className="absolute -right-2.5 -top-1.5 h-5 min-w-5 px-1"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>
      <Text
        variant="caption"
        className={cn('max-w-full', isFocused ? 'text-pandan-ink' : 'text-faint')}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.3}
        minimumFontScale={0.7}
      >
        {label}
      </Text>
    </Tappable>
  )
}

export type NavActionProps = {
  onPress: () => void
  label: string
  className?: string
}

/**
 * The add action: a pandan tile. Today floats it in the bottom right corner,
 * above the bar, as `Screen`'s `floatingTrailing`; the bar's own `action` slot
 * is unused, for the reason `NavBar` gives.
 */
export function NavAction({ onPress, label, className }: NavActionProps) {
  const colors = useThemeColors()

  return (
    <Squish
      depth={slab.lg}
      radius={radius.tile}
      slabClassName="bg-pandan-slab"
      className={cn('h-[62px] w-[62px] items-center justify-center bg-pandan', className)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {/* The app's own plus, drawn the way `Stepper` draws it on a pandan fill —
          and tinted to the role rather than to white, because the fill brightens
          in dark mode and takes near-black content.

          It was a `+` in Baloo 2 until now, which is the one thing a display face
          cannot be trusted with: the glyph sits on the font's maths axis, above
          the centre of its line box, so a tile that centred the line centred the
          wrong thing and the cross rode high in it. An icon is a square, and a
          square centres. */}
      <Icon set="ui" name="plus" size={28} tintColor={colors.onPandan} />
    </Squish>
  )
}

export type BottomNavProps<T extends string> = {
  /** Exactly four, which is what fits beside the action at a phone's width. */
  tabs: readonly [NavTab<T>, NavTab<T>, NavTab<T>, NavTab<T>]
  value: T
  onChange: (value: T) => void
  /** The add action at the right end. Omit to render four plain tabs. */
  onPressAction?: () => void
  actionLabel: string
  className?: string
}

/**
 * The bottom tab bar, fully controlled. Screens driven by the router use
 * `NavBar` / `NavItem` / `NavAction` directly instead, since their trigger
 * components have to be the pill's own children.
 */
export function BottomNav<T extends string>({
  tabs,
  value,
  onChange,
  onPressAction,
  actionLabel,
  className,
}: BottomNavProps<T>) {
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
    <NavBar
      className={className}
      action={onPressAction ? <NavAction onPress={onPressAction} label={actionLabel} /> : undefined}
    >
      {tabs.map(renderTab)}
    </NavBar>
  )
}
