import type { ReactNode } from 'react'
import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import { Tappable } from './Tappable'
import { Text } from './Text'

export type AppBarProps = {
  title: string
  /** Back affordance. Omit on a root screen. */
  onBack?: () => void
  /** Screen-reader name for the back button. Pass translated copy. */
  backLabel?: string
  /**
   * Which affordance the leading control is.
   *
   * `back` (a chevron) means "up one level, the previous screen is still
   * behind this one". `dismiss` (a cross) means "close this, and the thing
   * underneath is where you were". A modal is the second kind: it slides up
   * over the app rather than continuing a path through it, and a chevron there
   * promises a hierarchy the screen does not have.
   */
  leading?: 'back' | 'dismiss'
  /** Trailing controls. Keep to one; two crowds a 340pt phone. */
  action?: ReactNode
  /**
   * Makes the title tappable, for a screen whose title is a thing the user
   * owns — the name of one logged entry. Absent everywhere else, where the
   * title says which screen this is and is not anybody's to change.
   */
  onPressTitle?: () => void
  /**
   * How many lines the title may take before it truncates. One everywhere the
   * title names a screen, since those are short and fixed. Two where it is a
   * thing the user named or the model guessed at — a logged plate can be
   * "Korean fried chicken with rice and sides", and one line of that is a
   * dish nobody can identify from its first three words.
   *
   * The bar only grows when the title actually wraps, so a short one is laid
   * out exactly as before.
   */
  titleLines?: 1 | 2
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
export function AppBar({
  title,
  onBack,
  backLabel = 'Go back',
  leading = 'back',
  action,
  onPressTitle,
  titleLines = 1,
  className,
}: AppBarProps) {
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
          <Icon
            set="ui"
            name={leading === 'dismiss' ? 'close' : 'chevron-left'}
            size={20}
            tintColor={colors.muted}
          />
        </IconButton>
      ) : null}

      {onPressTitle ? (
        <Tappable className="flex-1" onPress={onPressTitle} accessibilityRole="button">
          <Text variant="subtitle" numberOfLines={titleLines}>
            {title}
          </Text>
        </Tappable>
      ) : (
        <Text variant="subtitle" className="flex-1" numberOfLines={titleLines}>
          {title}
        </Text>
      )}

      {action ?? (onBack ? <View className="w-[44px]" /> : null)}
    </View>
  )
}
