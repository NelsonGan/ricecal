import type { ReactNode } from 'react'
import { View } from 'react-native'

import { cn } from './cn'
import { Icon, type IconProps } from './Icon'
import { Text } from './Text'

export type EmptyStateProps = {
  title: string
  description?: string
  /** Art at the top, rendered at 96pt. */
  icon?: IconProps
  /** A single primary action. Two actions in an empty state is one too many. */
  action?: ReactNode
  className?: string
}

/**
 * The "nothing here yet" state.
 *
 * Copy is warm and forward-looking by house rule: "Add your first meal and
 * we'll start counting", never "No data". An empty screen is the one place a
 * user is most likely to leave, so it gets art, a sentence and a way out.
 */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <View className={cn('items-center gap-md px-gutter py-xl', className)}>
      {icon ? <Icon {...icon} size={96} /> : null}
      <Text variant="subtitle" className="text-center">
        {title}
      </Text>
      {description ? (
        <Text variant="body" className="text-center">
          {description}
        </Text>
      ) : null}
      {action}
    </View>
  )
}
