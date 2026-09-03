import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextInput } from 'react-native'

import type { Food } from '@/data'
import { Sheet, Text } from '@/ui'
import { FoodSearchPanel } from './FoodSearchPanel'

export type AddPartSheetProps = {
  visible: boolean
  onClose: () => void
  /** The dish to put on the plate. The host writes it and closes this. */
  onPick: (food: Food) => void
  /**
   * The part being swapped out, when that is what this search is for. Only the
   * heading changes: the question is the same one either way, and a user who
   * swiped Replace and got a sheet headed "Add an ingredient" has been told the
   * app misheard them.
   */
  replacing?: string
}

/**
 * Put something on the plate, by naming it out of the catalogue. The plate could
 * only shrink before this, so anything the scan missed had to be answered by
 * retyping the entry's four figures or spending a model call on "add a fried
 * egg", both of which guess at a number the catalogue knows.
 *
 * A sheet over the page that edits the plate rather than a mode inside it: that
 * one is a list with steppers and one Save, where this is a search field with the
 * keyboard up. A sheet over a page is also what makes closing it reveal the
 * plate; as a sheet swap, dismissing the search landed two panels back.
 *
 * The catalogue only, with no "My foods" tab: a meal is not an ingredient of
 * another meal, and offering last Tuesday's nasi lemak as a component doubles a
 * day's calories in two taps.
 *
 * The part is added at the food's own serving and at one of it. Resizing belongs
 * to the sheet that is already for that.
 */
export function AddPartSheet({ visible, onClose, onPick, replacing }: AddPartSheetProps) {
  const { t } = useTranslation(['logging', 'common'])
  const field = useRef<TextInput>(null)

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      // See `onShow` on `Sheet`: `autoFocus` inside a window that has not been
      // presented yet is dropped, and the sheet then opens over no keyboard.
      onShow={() => field.current?.focus()}
      /* Full height because this sheet raises the keyboard itself, and a capped
         panel is padded up off the bottom edge by `KeyboardAvoidingView` — the
         strip it leaves behind shows the scrim through the curve of the
         keyboard's corners. SCROLLABLE, unlike the other two full-height sheets
         that raise a keyboard: this one's body is a list of results, and a list
         that cannot be scrolled is a list of the first four things. The
         overshoot those two avoid by not scrolling is avoided here by focusing
         from `onShow`, after the window is up and its height is known. */
      fullHeight
    >
      {/* The words alone. A plus beside them was the glyph off the button that
          opened this sheet, repeated as decoration on the panel it opened —
          which says nothing the heading does not, on the one screen where the
          heading is already the answer to "where am I". */}
      <Text variant="subtitle">
        {replacing
          ? t('logging:detail.replaceOf', { name: replacing })
          : t('logging:detail.addPartTitle')}
      </Text>

      <FoodSearchPanel fieldRef={field} onPick={onPick} />
    </Sheet>
  )
}
