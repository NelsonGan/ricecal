import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import type { IconRef } from '@/data'
import { cn, Icon, icons, SearchField, Sheet, Text } from '@/ui'

/**
 * The illustrations a dish can be given, in the order they are offered:
 * cooked dishes first, ingredients after. Nothing from `body`, `system` or
 * `ui` — a dumbbell is not what anything on a plate looks like.
 */
const CHOOSABLE: IconRef[] = [
  ...Object.keys(icons.dishes).map((name) => ({ set: 'dishes', name }) as IconRef),
  ...Object.keys(icons.food).map((name) => ({ set: 'food', name }) as IconRef),
]

/** 'char-kuey-teow' → 'char kuey teow', so a search matches what it looks like. */
const words = (name: string) => name.replace(/-/g, ' ')

export type IconPickerProps = {
  visible: boolean
  onClose: () => void
  value: IconRef
  onChange: (icon: IconRef) => void
}

/**
 * Picks the illustration for a dish the user made up.
 *
 * There are around 180 of them, which is too many to scroll and exactly the
 * right number to search: the field filters on the file name with its hyphens
 * read as spaces, so typing "mee" finds every noodle.
 *
 * Choosing an icon closes the sheet. A confirm button on a grid where every
 * tile is already an unambiguous choice is a second tap for nothing.
 */
export function IconPicker({ visible, onClose, value, onChange }: IconPickerProps) {
  const { t } = useTranslation('logging')
  const [query, setQuery] = useState('')
  // Same reason as the search screen: filtering inline makes the field wait for
  // a 180-tile grid to re-render, which drops characters.
  const deferredQuery = useDeferredValue(query)

  const results = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    if (!needle) return CHOOSABLE
    return CHOOSABLE.filter((icon) => words(icon.name).includes(needle))
  }, [deferredQuery])

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('custom.iconTitle')}
      // Shorter than the default, because this sheet's own field raises the
      // keyboard: the grid has to give up the room the keyboard takes, or the
      // search field it belongs to slides off the top of the screen.
      bodyClassName="max-h-[280px]"
    >
      <SearchField
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
        clearLabel={t('search.clear')}
        placeholder={t('custom.iconSearch')}
      />

      {results.length === 0 ? (
        <Text variant="meta" className="py-4 text-center">
          {t('custom.iconEmpty')}
        </Text>
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        {results.map((icon) => {
          const selected = icon.set === value.set && icon.name === value.name
          return (
            <Pressable
              key={`${icon.set}/${icon.name}`}
              onPress={() => {
                onChange(icon)
                onClose()
              }}
              className={cn(
                'h-[62px] w-[62px] items-center justify-center rounded-tile border-[3px] bg-track',
                selected ? 'border-pandan' : 'border-transparent',
              )}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={words(icon.name)}
            >
              <Icon {...icon} size={40} />
            </Pressable>
          )
        })}
      </View>
    </Sheet>
  )
}
