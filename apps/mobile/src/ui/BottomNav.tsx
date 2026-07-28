import { Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { radius, slab } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Icon, type IconProps } from './Icon'
import { Squish } from './Squish'
import { Text } from './Text'

export type NavTab<T extends string> = {
  value: T
  label: string
  icon: IconProps
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
 * The bottom tab bar with a raised centre action.
 *
 * The tab tuple is typed as exactly four because the FAB is positioned by
 * splitting the array in half. Five tabs would put it off-centre, and the type
 * says so rather than leaving it to be discovered on screen.
 *
 * The FAB is the one element in the system allowed to break a container edge,
 * so the bar deliberately does not clip its overflow.
 */
export function BottomNav<T extends string>({
  tabs,
  value,
  onChange,
  onPressAction,
  actionLabel = 'Add',
  className,
}: BottomNavProps<T>) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const [left, right] = [tabs.slice(0, 2), tabs.slice(2)]

  const renderTab = (tab: NavTab<T>) => {
    const selected = tab.value === value
    return (
      <Pressable
        key={tab.value}
        onPress={() => onChange(tab.value)}
        className="min-w-0 flex-1 items-center gap-1.5 py-1"
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={tab.label}
      >
        <Icon {...tab.icon} size={26} tintColor={selected ? undefined : colors.faint} />
        <Text
          className={cn(
            'font-body-black text-[12px] leading-[14px]',
            selected ? 'text-pandan-ink' : 'text-faint',
          )}
        >
          {tab.label}
        </Text>
      </Pressable>
    )
  }

  return (
    <View
      className={cn('bg-canvas px-gutter pt-2', className)}
      style={{ paddingBottom: insets.bottom || 12 }}
      accessibilityRole="tablist"
    >
      <View className="flex-row items-center justify-between gap-2 rounded-card bg-surface px-4 py-3">
        {left.map(renderTab)}

        {onPressAction ? (
          <Squish
            depth={slab.lg}
            radius={radius.tile}
            // The negative margin lifts the FAB above the bar's top edge. It
            // shows because the bar sets no overflow-hidden — the FAB is the
            // one element in the system allowed to break a container edge.
            slabClassName="-mt-[26px] bg-pandan-slab"
            className="h-[62px] w-[62px] items-center justify-center bg-pandan"
            onPress={onPressAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <Text className="font-display text-[32px] leading-[38px] text-on-pandan">+</Text>
          </Squish>
        ) : null}

        {right.map(renderTab)}
      </View>
    </View>
  )
}
