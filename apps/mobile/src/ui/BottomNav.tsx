import type { ReactNode, Ref } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { radius, slab } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Icon, type IconProps } from './Icon'
import { Squish } from './Squish'
import { Tappable, type TappableProps } from './Tappable'
import { Text } from './Text'

/** Clearance between the pill and whatever is on screen above the bar. */
const BAR_PAD_TOP = 8
/**
 * Height of the pill: the tab column, which supplies its own interior padding.
 * 12 + a 26 icon + a 6 gap + a 17 caption line + 12.
 */
const PILL_HEIGHT = 73
/** How far the raised centre tile — 62 points square — rises above the pill. */
const ACTION_LIFT = 22

/**
 * How much of the bottom of the screen the bar occupies, safe area aside.
 *
 * Exported so a floating element — the toast — can clear it without measuring,
 * which would otherwise mean a layout pass before it could animate in. Summed
 * rather than hand-picked, because it was 96 against a bar that measured 89 and
 * nothing said which was wrong.
 */
export const NAV_BAR_HEIGHT = BAR_PAD_TOP + ACTION_LIFT + PILL_HEIGHT

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
 *
 * The pill is painted by a layer of its own rather than being the row's own
 * background, and that is what makes the raised centre action possible. The row
 * is `ACTION_LIFT` taller than the pill and reserves that height at the top, so
 * the tile can sit above the pill's edge while still being INSIDE the row. It
 * has to be: a view drawn outside its parent's frame gets no touches on iOS and
 * is clipped outright on Android, and the FAB used to overhang by 19 of its 62
 * points — a third of the button was decoration.
 *
 * Reserving the height also stops the tile from floating over the screen's own
 * content. The bar's canvas matches the screen's, so the raise reads the same
 * as it did while no longer overlapping a card that scrolls past under it.
 */
export function NavBar({ children, className }: { children: ReactNode; className?: string }) {
  const insets = useSafeAreaInsets()

  return (
    <View
      className={cn('bg-canvas px-gutter', className)}
      style={{ paddingTop: BAR_PAD_TOP, paddingBottom: insets.bottom || 12 }}
      accessibilityRole="tablist"
    >
      {/* No padding of its own: Yoga insets an absolute child by its parent's
          padding, so the pill below would come up short on both sides. */}
      <View>
        <View
          className="rounded-card bg-surface"
          style={{ position: 'absolute', top: ACTION_LIFT, left: 0, right: 0, bottom: 0 }}
          pointerEvents="none"
        />
        {/* The tabs size this row, and each carries its own vertical padding —
            the pill's interior padding is theirs, so the pill is exactly the
            height of a tab column and the reserved strip above it is exactly
            the lift. */}
        <View className="flex-row justify-between gap-2 px-4" style={{ paddingTop: ACTION_LIFT }}>
          {children}
        </View>
      </View>
    </View>
  )
}

export type NavItemProps = Omit<TappableProps, 'children' | 'style'> & {
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
export function NavItem({ label, icon, isFocused = false, href, style, ...rest }: NavItemProps) {
  const colors = useThemeColors()

  return (
    // `Tappable`, so a tab answers a tap in the hand like every other control.
    // As a plain `Pressable` it was the only tap in the app that moved the whole
    // screen and felt like nothing.
    <Tappable
      {...rest}
      // `py-3` is the pill's interior padding, living on the tab rather than on
      // the row: it is what gives the pill its height, and it makes the whole
      // depth of the bar tappable instead of just the icon and its label.
      className="min-w-0 flex-1 items-center gap-1.5 py-3"
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={label}
    >
      {/* An inactive tab is grey, and the tint goes through `style` rather than
          through `tintColor`. `expo-image` documents both, but only the style
          reliably reaches the view here — sizing arrives the same way and
          demonstrably works, while the prop left these illustrations in full
          colour when unfocused. */}
      <Icon
        {...icon}
        size={26}
        style={isFocused ? undefined : { tintColor: colors.faint }}
        tintColor={isFocused ? undefined : colors.faint}
      />
      <Text variant="caption" className={isFocused ? 'text-pandan-ink' : 'text-faint'}>
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
 * The raised centre action.
 *
 * The lift is a negative margin on a `self-start` box, and both halves of that
 * matter. `self-start` because the row's cross-axis alignment decides what a
 * negative margin does: under the `items-center` this used to sit in, centring a
 * margin box that is 26 points shorter than its border box moved the tile up by
 * only 13 — half of what was written — and pushed it out of line with the tabs
 * on the way. Against the start edge the shift is exactly the margin. And a
 * margin rather than a transform because the box has to keep its width, so the
 * two pairs of tabs stay evenly spaced either side of it.
 */
export function NavAction({ onPress, label, className }: NavActionProps) {
  const colors = useThemeColors()

  return (
    <View className="self-start" style={{ marginTop: -ACTION_LIFT }}>
      <Squish
        depth={slab.lg}
        radius={radius.tile}
        slabClassName="bg-pandan-slab"
        className={cn('h-[62px] w-[62px] items-center justify-center bg-pandan', className)}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {/* The app's own plus, drawn the way `Stepper` draws it on a pandan
            fill — and tinted to the role rather than to white, because the fill
            brightens in dark mode and takes near-black content.

            It was a `+` in Baloo 2 until now, which is the one thing a display
            face cannot be trusted with: the glyph sits on the font's maths axis,
            above the centre of its line box, so a tile that centred the line
            centred the wrong thing and the cross rode high in it. An icon is a
            square, and a square centres. */}
        <Icon set="ui" name="plus" size={28} tintColor={colors.onPandan} />
      </Squish>
    </View>
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
