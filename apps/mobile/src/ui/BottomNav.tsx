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

/**
 * How much of the bottom of the screen the bar occupies, safe area aside: the
 * pill, and nothing else.
 *
 * The tab column supplies the height — 12 + a 26 icon + a 6 gap + a 17 caption
 * line + 12 — and there is no padding above it. There was 8pt, and on a canvas
 * background that is a grey stripe between the screen's content and the bar;
 * whatever spacing the last card wants is the screen's business, not the bar's.
 *
 * Exported so a floating element — the toast — can clear the bar without
 * measuring, which would otherwise mean a layout pass before it could animate in.
 */
export const NAV_BAR_HEIGHT = 73

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
 * The centre action does not rise above the pill, and that is the whole shape of
 * this component. It used to, and the raise cost more than it was worth three
 * times over. Overhanging the pill, the top third of the button took no touches
 * on iOS and was clipped outright on Android — a view drawn outside its parent's
 * frame is decoration. Reserving the height inside the bar instead fixed that and
 * bought a band of bare canvas the height of the button, sitting between the
 * screen's content and the pill, which is what it looked like: a grey gap.
 *
 * So the pill is the row again, one view, and the button is a tile in it. The tab
 * column is 73pt tall and the tile is 68 with its slab, so it fits with room to
 * spare and needs nothing reserved, nothing absolute, and no negative margins.
 */
export function NavBar({ children, className }: { children: ReactNode; className?: string }) {
  const insets = useSafeAreaInsets()

  return (
    <View
      className={cn('bg-canvas px-gutter', className)}
      style={{ paddingBottom: insets.bottom || 12 }}
      accessibilityRole="tablist"
    >
      {/* The tabs size this row: each carries its own vertical padding, so the
          pill is exactly the height of a tab column. */}
      <View className="flex-row items-center justify-between gap-2 rounded-card bg-surface px-4">
        {children}
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
 * The centre action: a pandan tile in the bar, between the second tab and the
 * third.
 *
 * It sits inside the pill like everything else in the row — see `NavBar` for why
 * it no longer breaks the top edge. Centred by the row's `items-center`, with no
 * margin of its own to fight it.
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

export type FloatingActionProps = NavActionProps

/**
 * The same pandan tile, floating over a screen instead of sitting in the bar.
 *
 * It used to be `NavAction`, in the middle of the tab bar, and that is what
 * capped the bar at four tabs: a centre action is centred by having the same
 * number of tabs either side of it. Recipes made five, so the action came out
 * and the bar is tabs alone.
 *
 * Bigger than the bar version — 64pt against 62 — because a control with
 * nothing beside it has no neighbours to be measured against, and because it is
 * now the only target on the screen that is not a row of the diary.
 *
 * `NavAction` is still here and still used by the fully controlled `BottomNav`
 * the design gallery renders. The two are one visual; if the fill or the slab
 * changes, it changes in both.
 */
export function FloatingAction({ onPress, label, className }: FloatingActionProps) {
  const colors = useThemeColors()

  return (
    <Squish
      depth={slab.lg}
      radius={radius.tile}
      slabClassName="bg-pandan-slab"
      className={cn('h-[64px] w-[64px] items-center justify-center bg-pandan', className)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon set="ui" name="plus" size={30} tintColor={colors.onPandan} />
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
