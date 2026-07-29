import type { ReactNode } from 'react'
import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { cn, Icon, type IconProps, ListRow, Switch, Text } from '@/ui'

export type SettingRowProps = {
  title: string
  /** The current setting, right aligned before the chevron. */
  value?: string
  icon?: IconProps
  onPress: () => void
  divider?: boolean
  className?: string
}

/** A settings row that opens something else. Icon, title, current value, chevron. */
export function SettingRow({
  title,
  value,
  icon,
  onPress,
  divider = true,
  className,
}: SettingRowProps) {
  return (
    <ListRow
      title={title}
      leading={icon ? <Icon {...icon} size={30} /> : undefined}
      // The value goes in the trailing slot, which `ListRow` treats as
      // replacing its chevron — so the chevron is asked for explicitly and
      // rendered once, beside the value.
      trailing={value ? <Trailing value={value} /> : undefined}
      divider={divider}
      onPress={onPress}
      className={className}
    />
  )
}

function Trailing({ value }: { value: string }) {
  const colors = useThemeColors()
  return (
    <View className="flex-row items-center gap-1.5">
      <Text variant="meta">{value}</Text>
      <Icon set="ui" name="chevron-right" size={18} tintColor={colors.faint} />
    </View>
  )
}

export type ToggleRowProps = {
  title: string
  description?: string
  value: boolean
  onValueChange: (value: boolean) => void
  leading?: ReactNode
  divider?: boolean
  className?: string
}

/**
 * A settings row that toggles.
 *
 * The whole row is not pressable: a switch that also responds to a tap on its
 * label makes an accidental flick very easy on a scrolling list, and the design
 * puts the target on the switch.
 */
export function ToggleRow({
  title,
  description,
  value,
  onValueChange,
  leading,
  divider = true,
  className,
}: ToggleRowProps) {
  return (
    <View className={cn('gap-0', className)}>
      <View className="flex-row items-center gap-3 py-2.5">
        {leading}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="label">{title}</Text>
          {description ? <Text variant="meta">{description}</Text> : null}
        </View>
        <Switch value={value} onValueChange={onValueChange} accessibilityLabel={title} />
      </View>
      {divider ? <View className="h-px bg-line" /> : null}
    </View>
  )
}
