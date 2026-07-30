import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { IconRef } from '@/data'
import { Button, cn, Icon, icons, SearchField, Sheet, Squish, Text } from '@/ui'

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
  /** `null` clears the override and hands the row back to the food's own icon. */
  onSelect: (icon: IconRef | null) => void
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
export function IconPicker({ visible, onClose, selected, onSelect }: IconPickerProps) {
  const { t } = useTranslation(['logging', 'common'])
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const needle = words(query.trim().toLowerCase())
    if (!needle) return CHOICES
    return CHOICES.filter((choice) => choice.label.includes(needle))
  }, [query])

  const choose = (icon: IconRef | null) => {
    onSelect(icon)
    setQuery('')
    onClose()
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('logging:icon.title')}
      description={t('logging:icon.description')}
      scrollable
      // Capped because this sheet raises the keyboard: the full grid plus a
      // keyboard is taller than a phone, and the overflow comes off the top where
      // the search field is.
      bodyClassName="max-h-[420px]"
      footer={
        selected ? (
          <Button variant="ghost" fullWidth onPress={() => choose(null)}>
            {t('logging:icon.clear')}
          </Button>
        ) : null
      }
    >
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
        <View className="flex-row flex-wrap gap-2.5">
          {matches.map((choice) => {
            const isSelected =
              selected?.set === choice.icon.set && selected?.name === choice.icon.name

            return (
              <Squish
                key={choice.key}
                depth={4}
                radius={18}
                slabClassName={isSelected ? 'bg-pandan-soft-line' : 'bg-line'}
                className={cn(
                  'h-[64px] w-[64px] items-center justify-center border-[3px]',
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
