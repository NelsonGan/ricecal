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
}

/**
 * PUT SOMETHING ON THE PLATE, by naming it out of the catalogue.
 *
 * The plate could only ever shrink before this: `PlateEditor` resizes a part and
 * takes one off, and anything the scan MISSED had to be answered either by
 * retyping the whole entry's four figures or by spending a model call on "add a
 * fried egg". Both of those guess at a number the catalogue already knows.
 *
 * A sheet OVER the page that edits the plate, rather than a mode inside it,
 * because the two are different shapes of question. That one is a list of things
 * with steppers and one Save; this is a search field with the keyboard up, and a
 * pick that writes immediately and dismisses. Being a sheet over a page rather
 * than a second sheet is what makes closing it reveal the plate again: it was a
 * sheet swap for a while, and dismissing the search then landed the user two
 * panels back on the food detail.
 *
 * THE CATALOGUE ONLY, with no "My foods" tab. `FoodSearchPanel`'s second list is
 * whole meals this account has eaten, and a meal is not an ingredient of another
 * meal — offering last Tuesday's nasi lemak as a component of today's plate is a
 * way to double a day's calories in two taps.
 *
 * The part is added at the food's own serving and at one of it. Resizing belongs
 * to the sheet that is already for exactly that, where the weight can be typed
 * and read back as a count.
 */
export function AddPartSheet({ visible, onClose, onPick }: AddPartSheetProps) {
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
      <Text variant="subtitle">{t('logging:detail.addPartTitle')}</Text>

      <FoodSearchPanel fieldRef={field} onPick={onPick} />
    </Sheet>
  )
}
