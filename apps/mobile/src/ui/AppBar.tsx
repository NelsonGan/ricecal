import type { ReactNode } from 'react'
import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import { Text } from './Text'

export type AppBarProps = {
  title: string
  /** Back affordance. Omit on a root screen. */
  onBack?: () => void
  /** Screen-reader name for the back button. Pass translated copy. */
  backLabel?: string
  /** Trailing controls. Keep to one; two crowds a 340pt phone. */
  action?: ReactNode
  className?: string
}

/**
 * An in-content header bar.
 *
 * A styled View rather than a configured native header: the design puts the
 * bar on a rounded canvas-coloured plate with squishy 44pt controls, and a
 * native header cannot do either. Screens using this should set
 * `headerShown: false` on their Stack.Screen.
 *
 * When there is no `action`, an invisible spacer keeps the title optically
 * centred instead of drifting right.
 */
export function AppBar({ title, onBack, backLabel = 'Go back', action, className }: AppBarProps) {
  const colors = useThemeColors()

  return (
    <View
      className={cn('flex-row items-center gap-md rounded-tile bg-canvas p-3', className)}
      accessibilityRole="header"
    >
      {onBack ? (
        <IconButton size="sm" accessibilityLabel={backLabel} onPress={onBack}>
          {/* Tinted: chrome is monochrome, and the illustration's own palette
              reads as a stray accent next to a title. */}
          <Icon set="ui" name="chevron-left" size={20} tintColor={colors.muted} />
        </IconButton>
      ) : null}

      <Text variant="subtitle" className="flex-1" numberOfLines={1}>
        {title}
      </Text>

      {action ?? (onBack ? <View className="w-[44px]" /> : null)}
    </View>
  )
}
