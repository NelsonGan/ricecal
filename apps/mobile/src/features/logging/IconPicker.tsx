import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { IconRef } from '@/data'
import { cn, Icon, icons, SearchField, Sheet, Squish, Text } from '@/ui'
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
 * Picks a picture for one logged item: a drawing, or a photo of the plate.
 *
 * The drawings exist because the catalogue cannot be illustrated — a few hundred of
 * them against hundreds of megabytes of imported foods, so most rows have none — and
 * a photo is the better answer whenever one is possible.
 *
 * Two ways in, one showing at a time, chosen by the pair of tiles at the top. The
 * same shape the quick selector uses for snap and search, and for the same reason:
 * with the two visibly exclusive, nothing has to say so in words. Search comes up
 * first because it is the answer for most dishes, and it is not remembered between
 * openings — a sheet that came back on the camera because that is where it was left
 * opens the wrong way round for the next dish.
 *
 * The drawings are searchable rather than a plain grid: two hundred choices is more
 * than anyone scrolls through, and the names are the dish names, so typing "mee"
 * narrows to the noodles.
 */
export function IconPicker({ visible, onClose, selected, onSelect, onPickPhoto }: IconPickerProps) {
  const { t } = useTranslation(['logging', 'common'])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('search')

  const matches = useMemo(() => {
    const needle = words(query.trim().toLowerCase())
    if (!needle) return CHOICES
    return CHOICES.filter((choice) => choice.label.includes(needle))
  }, [query])

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
      // Capped because this sheet raises the keyboard: the full grid plus a
      // keyboard is taller than a phone, and the overflow comes off the top where
      // the search field is.
      bodyClassName="max-h-[420px]"
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
            <View className="flex-row flex-wrap justify-between gap-y-2.5">
              {matches.map((choice) => {
                const isSelected =
                  selected?.set === choice.icon.set && selected?.name === choice.icon.name

                return (
                  <Squish
                    key={choice.key}
                    depth={4}
                    radius={18}
                    // The width lives on the container, which is the box the row
                    // measures; the surface fills it. Putting it on the surface
                    // instead leaves the container shrink-wrapped and the row ragged.
                    containerClassName="w-[18.5%]"
                    slabClassName={isSelected ? 'bg-pandan-soft-line' : 'bg-line'}
                    className={cn(
                      'h-[64px] w-full items-center justify-center border-[3px]',
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
                  </Squish>
                )
              })}
            </View>
          )}
        </>
      )}
    </Sheet>
  )
}
