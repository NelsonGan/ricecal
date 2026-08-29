import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { IconRef } from '@/data'
import { useAfterInteractions } from '@/lib/use-after-interactions'
import { cn, Icon, icons, SearchField, Sheet, Tappable, Text } from '@/ui'
import { InlineCamera } from './InlineCamera'
import { QuickAction } from './QuickAction'

/**
 * Which sets a dish can be illustrated from.
 *
 * `dishes` first because that is where the local food is — a plate of nasi lemak
 * has a drawing of nasi lemak. `food` is the ingredient and drink set, which
 * covers most of what `dishes` does not. The other three sets are chrome:
 * `system` and `ui` are controls, `body` is exercise, and none of them is a meal.
 */
const SETS = ['dishes', 'food'] as const

/** "char-kuey-teow" → "char kuey teow", for reading and for searching. */
const words = (name: string) => name.replace(/-/g, ' ')

/** The icon itself, kept whole: `Icon` takes the tagged pair, not two props. */
type Choice = { key: string; label: string; icon: IconRef }

const CHOICES: Choice[] = SETS.flatMap((set) =>
  Object.keys(icons[set]).map((name) => ({
    key: `${set}/${name}`,
    label: words(name),
    icon: { set, name } as IconRef,
  })),
)

/** Tiles to a row, always — see the note on the grid. */
const COLUMNS = 5

/**
 * How many tiles are built on the frame the sheet opens.
 *
 * There are 269 of them, and mounting the lot is what made this sheet stick before
 * it moved: a native `Modal` renders nothing at all until it is visible, so every
 * one of those tiles is built on the single frame that also has to start the panel's
 * rise.
 *
 * Eight rows, which is what fills a tall phone now the sheet is full height rather
 * than capped at 420 points. It has to cover the visible area or the last row or two
 * pop in a moment after the sheet arrives, which is the thing this was avoiding.
 */
const FIRST_PAINT = COLUMNS * 8

export type IconPickerProps = {
  visible: boolean
  onClose: () => void
  /** What is on the row now, so the current choice reads as chosen. */
  selected?: IconRef
  onSelect: (icon: IconRef) => void
  /**
   * A photo was taken or chosen, as a local `file://` uri.
   *
   * Optional: a caller with nowhere to put a photo simply does not pass it, and the
   * sheet is the grid alone. The host owns what happens next — the upload, the row,
   * the failure — because this sheet knows about pictures and that is a different
   * kind of thing.
   */
  onPickPhoto?: (photoUri: string) => void
}

/** Which half of the sheet is showing. */
type Tab = 'search' | 'camera'

/**
 * Picks a picture for one logged item: a drawing, or a photo of the plate. The
 * drawings exist because the catalogue cannot be illustrated, and a photo is the
 * better answer whenever one is possible.
 *
 * Two ways in, one showing at a time, chosen by the tiles at the top: the same
 * shape the quick selector uses, so nothing has to say the two are exclusive.
 * Search comes up first and is not remembered between openings, or a sheet that
 * was left on the camera opens the wrong way round for the next dish.
 *
 * The drawings are searchable rather than a grid: two hundred choices is more
 * than anyone scrolls through, and the names are dish names.
 */
export function IconPicker({ visible, onClose, selected, onSelect, onPickPhoto }: IconPickerProps) {
  const { t } = useTranslation(['logging', 'common'])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('search')
  // The rest of the grid, once the sheet has finished arriving. Reset every time it
  // opens, which is what the `visible` argument is for.
  const settled = useAfterInteractions(visible)

  const matches = useMemo(() => {
    const needle = words(query.trim().toLowerCase())
    if (!needle) return CHOICES
    return CHOICES.filter((choice) => choice.label.includes(needle))
  }, [query])

  const shown = settled ? matches : matches.slice(0, FIRST_PAINT)

  /**
   * The cells that finish the last row.
   *
   * They draw nothing and are not reachable — the point is purely that the line has
   * five things on it, so `justify-between` gives it the same columns as every line
   * above. Cheaper than sizing the grid ourselves: five exact fifths overflow a line
   * by a rounding error on some screen widths, and the fifth tile wraps.
   *
   * Keyed by position, which is all a spacer has.
   */
  const fillers = Array.from(
    { length: (COLUMNS - (shown.length % COLUMNS)) % COLUMNS },
    (_, index) => `gap-${index}`,
  )

  const choose = (icon: IconRef) => {
    onSelect(icon)
    setQuery('')
    onClose()
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={t('logging:icon.title')}
      // No description. It read "Just for this entry. A photo of the real plate
      // beats any of these" — a caveat about scope nobody asked about, and advice
      // against the thing the sheet is for. The camera is right there instead.
      scrollable
      // Full height while the grid is showing, which is how the add menu handles
      // its own search and is the only arrangement that survives the keyboard.
      //
      // A capped sheet sits on the bottom edge and gets out of the keyboard's way
      // by being padded from underneath — so the panel lifted, and the strip it
      // left behind showed the scrim through the curve of the keyboard's top
      // corners. Two dark notches under a white sheet.
      //
      // Full height instead: the panel reaches the bottom of the screen and stays
      // there, and the grid insets its own scroll content so the search field
      // stays above the keys. Nothing moves, so there is no gap to show through.
      // The camera tab keeps the capped panel — it raises no keyboard and has one
      // viewfinder in it, which a full-height sheet would strand in a field of
      // empty surface.
      fullHeight={tab === 'search'}
      // No "use no picture" row. Nothing arrives here with a picture it did not
      // ask for — a dish out of the catalogue has none, and a photo is guarded by
      // its own confirmation — so the only thing that button could undo is a
      // choice made in this same sheet a moment earlier, and closing it does that
      // already.
    >
      {onPickPhoto ? (
        <View className="flex-row gap-2.5">
          <QuickAction
            label={t('logging:icon.searchTab')}
            icon={{ set: 'ui', name: 'search' }}
            selected={tab === 'search'}
            onPress={() => setTab('search')}
          />
          <QuickAction
            label={t('logging:icon.cameraTab')}
            icon={{ set: 'system', name: 'camera' }}
            tone="pandan"
            selected={tab === 'camera'}
            onPress={() => setTab('camera')}
          />
        </View>
      ) : null}

      {onPickPhoto && tab === 'camera' ? (
        // The viewfinder the quick selector uses, doing the other thing it can do:
        // handing the shot back rather than starting an entry from it. A shot with no
        // uri — which is every simulator — leaves the sheet where it is.
        <InlineCamera
          onCapture={(photoUri) => {
            if (photoUri) onPickPhoto(photoUri)
          }}
        />
      ) : (
        <>
          <SearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            clearLabel={t('logging:search.clear')}
            placeholder={t('logging:icon.searchPlaceholder')}
            // A placeholder is not a label: it disappears the moment anything is
            // typed, and a screen reader announcing "nasi lemak, teh tarik, fish"
            // describes the examples rather than the field.
            accessibilityLabel={t('logging:icon.searchLabel')}
          />

          {matches.length === 0 ? (
            <Text variant="meta">{t('logging:icon.noMatch', { query: query.trim() })}</Text>
          ) : (
            // Five to a row, spanning the full width. Fixed-width tiles with a fixed
            // gap left a ragged 57pt of nothing down the right-hand side of a phone,
            // which read as the grid having been cut off.
            //
            // `justify-between` spreads a line across that full width, which is what
            // sizes the gaps — and what made a short last row wrong: four tiles were
            // spread over the same span as five, so the last row lined up with none
            // of the columns above it. The blank cells after the map finish the row,
            // and the tiles go back in their columns.
            <View className="flex-row flex-wrap justify-between gap-y-2.5">
              {shown.map((choice) => {
                const isSelected =
                  selected?.set === choice.icon.set && selected?.name === choice.icon.name

                return (
                  /* `Tappable` rather than `Squish`, which is the one place in the
                     app that opts out of the squish — and the reason is the count.
                     Every `Squish` carries two shared values and two animated
                     styles; across this grid that is a thousand reanimated hooks
                     registered on both threads for a press nobody sees, since
                     choosing a tile closes the sheet on the same frame. The haptic
                     is the feedback here. */
                  <Tappable
                    key={choice.key}
                    className={cn(
                      'h-[64px] w-[18.5%] items-center justify-center rounded-[18px] border-[3px]',
                      isSelected ? 'border-pandan bg-pandan-soft' : 'border-line bg-surface',
                    )}
                    onPress={() => choose(choice.icon)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    // The slug read as words. Without it a screen reader gets nothing
                    // at all: these are images, and the label is the only name they
                    // have.
                    accessibilityLabel={choice.label}
                  >
                    <Icon {...choice.icon} size={40} />
                  </Tappable>
                )
              })}

              {fillers.map((id) => (
                <View key={id} className="w-[18.5%]" />
              ))}
            </View>
          )}
        </>
      )}
    </Sheet>
  )
}
