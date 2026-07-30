import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { IconRef } from '@/data'
import { cn, Icon, icons, SearchField, Sheet, Squish, Text } from '@/ui'

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
   * Offers the camera as the other way to answer this.
   *
   * Optional: a caller with nowhere to put a photo simply does not pass it, and
   * the sheet is the grid alone. The host owns the capture and the upload — this
   * sheet knows about drawings, and a photo is a different kind of thing with a
   * permission prompt, a bucket and a failure mode of its own.
   */
  onTakePhoto?: () => void
}

/**
 * Picks an illustration for one logged item.
 *
 * It exists because the catalogue cannot be illustrated. There are a few hundred
 * drawings against hundreds of megabytes of imported foods, so most rows have
 * none — and this is the one way to give a plate a picture without photographing
 * it.
 *
 * Searchable rather than a plain grid: two hundred choices is more than anyone
 * scrolls through, and the names are the dish names, so typing "mee" narrows to
 * the noodles.
 */
export function IconPicker({ visible, onClose, selected, onSelect, onTakePhoto }: IconPickerProps) {
  const { t } = useTranslation(['logging', 'common'])
  const [query, setQuery] = useState('')

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
      {/* The camera first, and the grid under it. A photo of the actual plate is
          the better answer where one is possible, and the drawings exist because
          most of the time it is not — so the order says which is which without a
          line of copy explaining it. */}
      {onTakePhoto ? (
        <>
          <Squish
            depth={4}
            radius={18}
            slabClassName="bg-pandan-soft-line"
            className="flex-row items-center gap-3 border-[3px] border-pandan bg-pandan-soft px-4 py-3.5"
            onPress={onTakePhoto}
            accessibilityRole="button"
            accessibilityLabel={t('logging:icon.takePhoto')}
          >
            <Icon set="system" name="camera" size={28} />
            <Text variant="bodyStrong" className="flex-1">
              {t('logging:icon.takePhoto')}
            </Text>
          </Squish>

          <Text variant="overline">{t('logging:icon.orChoose')}</Text>
        </>
      ) : null}

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
    </Sheet>
  )
}
