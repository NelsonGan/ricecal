import { useRef } from 'react'
import type { TextInput } from 'react-native'

import { Sheet, TextField } from '@/ui'

export type RenameSheetProps = {
  visible: boolean
  onClose: () => void
  /** The name being retyped. Staged on the detail screen, like every edit there. */
  value: string
  onChangeText: (value: string) => void
  /** What the name falls back to if the field is left empty: the row's own. */
  placeholder: string
  /** Screen-reader name for the field, since nothing labels it on screen. */
  label: string
  /**
   * What a screen reader calls the handle. "Done" rather than "Close": the
   * name is kept whichever way the sheet goes away, so closing it IS finishing.
   */
  closeLabel?: string
}

/**
 * RENAME — one field, and nothing else in the way of it.
 *
 * Tapping the title on the food detail screen used to open a card under the
 * app bar, which is a strange place to put a keyboard: the field appeared
 * near the top, the keyboard rose over the bottom half of a screen full of
 * controls the user was not editing, and the picture and the totals card were
 * left half visible between the two. The name is one short string, and the
 * moment of typing it deserves the whole screen.
 *
 * Full height and NOT scrollable, both for the reasons `FixSheet` gives at
 * length: a capped panel is padded up off the bottom edge when the keyboard
 * opens and shows the scrim through the curve of its corners, and a scroll
 * view overshoots on the first open and carries the field off the top. One
 * field at the top of a full-height panel, with the keyboard covering the
 * empty part below it, has neither problem.
 *
 * No button. The name stages in the caller's state, so the sheet closing by
 * any route — the return key, the handle, the scrim, Android's back — keeps
 * what was typed, and Save on the screen behind is what writes it. A confirm
 * button here would be a second commit for something that was never
 * uncommitted.
 */
export function RenameSheet({
  visible,
  onClose,
  value,
  onChangeText,
  placeholder,
  label,
  closeLabel,
}: RenameSheetProps) {
  const field = useRef<TextInput>(null)

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={closeLabel}
      // See `onShow` on `Sheet`: `autoFocus` inside a window that has not been
      // presented yet is dropped, and the sheet then opens over no keyboard.
      onShow={() => field.current?.focus()}
      fullHeight
      scrollable={false}
    >
      {/* No label. The title the user just tapped IS the label, and the field
          opens holding that same name — a caption over it turns a rename into
          a form. The copy stays as the accessible name, which is the one place
          a caption was actually carrying information. */}
      <TextField
        ref={field}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={label}
        maxLength={120}
        returnKeyType="done"
        /* Done closes. NOT blur, which the inline card used: blur is also the
           keyboard being put away, and a sheet that vanishes when the user does
           that closes on them mid-edit. */
        onSubmitEditing={onClose}
      />
    </Sheet>
  )
}
