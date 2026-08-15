import type { ReactNode } from 'react'
import { TextInput, View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import { Tappable } from './Tappable'
import { Text } from './Text'

export type AppBarProps = {
  /**
   * The screen's name. OPTIONAL, for a bar that is only a back affordance.
   *
   * The sign-in screen is the one that needs it: it carries its own large
   * heading a few points below, and repeating that heading in the bar would say
   * the same words twice on a screen with three words on it. Left out, the bar
   * is a chevron and nothing else, and a trailing `action` still keeps its edge.
   */
  title?: string
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
   * Retype the title WHERE IT IS. Present means editing: the heading becomes a
   * caret in the same face, the same size and the same place, the way a figure
   * on the food detail card does when it is tapped. Nothing opens, nothing
   * moves, and the bar is the same height in both states.
   *
   * One prop rather than four loose ones because they are useless apart, and
   * `value` is separate from `title` because a name emptied is not a title
   * emptied: the heading falls back to whatever the screen names the thing by
   * default, and that fallback is what the empty field shows as its
   * placeholder.
   */
  titleEdit?: {
    value: string
    onChangeText: (value: string) => void
    /** The return key, or the field losing focus. Both mean the same here. */
    onDone: () => void
    /**
     * Screen-reader name for the field. The heading it replaced was the only
     * thing labelling it.
     */
    label?: string
    maxLength?: number
  }
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
 *
 * The title has three states, and the second two are one screen's: a heading,
 * a heading that can be tapped (`onPressTitle`), and a field standing exactly
 * where the heading was (`titleEdit`). See the note on that prop for why the
 * field is bare.
 */
export function AppBar({
  title,
  onBack,
  backLabel = 'Go back',
  leading = 'back',
  action,
  onPressTitle,
  titleEdit,
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

      {titleEdit ? (
        /* The heading's own face and place, with a caret in it. A bordered
           field here would read as a form opening over the bar, which is what
           the card under it used to be and the reason this moved. */
        <TextInput
          value={titleEdit.value}
          onChangeText={titleEdit.onChangeText}
          onBlur={titleEdit.onDone}
          onSubmitEditing={titleEdit.onDone}
          /* What the heading falls back to when the field is emptied, so the
             empty state of the field says what the empty state of the title
             will be rather than going blank. */
          placeholder={title}
          placeholderTextColor={colors.faint}
          accessibilityLabel={titleEdit.label}
          maxLength={titleEdit.maxLength}
          autoFocus
          returnKeyType="done"
          /* Wraps like the heading it replaces, so a name that took two lines
             a moment ago still takes two. `blurAndSubmit` is what keeps the
             return key meaning "done" — a multiline field would otherwise put
             a newline in a dish name. */
          multiline={titleLines > 1}
          submitBehavior="blurAndSubmit"
          /* No `leading-*`, unlike the `Text` this replaces: a `TextInput`
             crops to its line box where `Text` overflows one, so a variant's
             tighter leading shears the tops off tall glyphs. The font picks
             its own line box, and the cap below is what stops the bar growing.
             The row's 44pt controls absorb the point or two of difference. */
          className="flex-1 font-display text-[20px] text-heading"
          style={[
            // The padding UIKit gives a field by default, which the heading
            // does not take, and which would shift the title as it was tapped.
            { paddingVertical: 0, paddingHorizontal: 0 },
            // Multiline only, both of them. A cap on a single-line field is a
            // chance to crop the one line it has, and vertical alignment in a
            // box the text already fills means nothing.
            titleLines > 1 && {
              // Never more lines than the heading was allowed. Without it a
              // long name being typed grows a third line and takes the bar
              // with it; with it the field scrolls inside the height it had.
              maxHeight: titleLines * 30,
              // Android centres a multiline field's text as the box grows.
              textAlignVertical: 'top' as const,
            },
          ]}
          cursorColor={colors.pandan}
          selectionColor={colors.pandan}
        />
      ) : onPressTitle ? (
        <Tappable className="flex-1" onPress={onPressTitle} accessibilityRole="button">
          <Text variant="subtitle" numberOfLines={titleLines}>
            {title}
          </Text>
        </Tappable>
      ) : title ? (
        <Text variant="subtitle" className="flex-1" numberOfLines={titleLines}>
          {title}
        </Text>
      ) : (
        /* Untitled: the space is still claimed, so a trailing action stays on
           the right edge and the chevron stays on the left rather than the two
           meeting in the middle. */
        <View className="flex-1" />
      )}

      {action ?? (onBack ? <View className="w-[44px]" /> : null)}
    </View>
  )
}
