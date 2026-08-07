import { View } from 'react-native'

import { Icon, type IconProps, Text } from '@/ui'

export type FactRowProps = {
  icon: IconProps
  title: string
  body?: string
}

/**
 * An icon, a line, and the line under it.
 *
 * The shape the back half of onboarding repeats: what a health store gives us,
 * what a reminder will say, what each way of logging is for. Three screens want
 * it, and copies of it drift — `ConnectPanel` has a private one of exactly this
 * shape, and the two are already two points apart on the icon.
 *
 * `accessible` on the row, so a screen reader reads "Active energy, what you
 * burned moving" as one thing rather than as two stops.
 */
export function FactRow({ icon, title, body }: FactRowProps) {
  return (
    <View className="flex-row items-center gap-md" accessible>
      <Icon {...icon} size={32} />
      <View className="min-w-0 flex-1">
        <Text variant="bodyStrong">{title}</Text>
        {body ? <Text variant="meta">{body}</Text> : null}
      </View>
    </View>
  )
}
