import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { IconRef } from '@/data'
import { cn, Divided, Icon, Sheet, Tappable, Text, useHeld } from '@/ui'

export type SheetAction = {
  key: string
  label: string
  icon?: IconRef
  tone?: 'default' | 'danger'
  /** A tick beside the row, for the choice that is already in force. */
  selected?: boolean
  onPress: () => void
}

/**
 * A short list of things to do to one item: an exercise's menu, a set's type.
 *
 * The action runs once the sheet is fully gone (`onDismiss`), not on the tap:
 * most of these open another sheet or push a screen, and starting either while
 * this native modal is still on its way out is how iOS ends up presenting
 * nothing at all.
 */
export function ActionSheet({
  visible,
  onClose,
  title,
  description,
  actions,
}: {
  visible: boolean
  onClose: () => void
  title?: string
  description?: string
  actions: readonly SheetAction[]
}) {
  const { t } = useTranslation('common')
  const pending = useRef<(() => void) | null>(null)
  // What it showed while open, kept while it slides away. Callers clear the
  // thing a sheet is about as it closes, and the list emptied and the title
  // went blank in the middle of the slide.
  const shown = useHeld({ title, description, actions }, visible)

  return (
    <Sheet
      placement="center"
      visible={visible}
      onClose={onClose}
      closeLabel={t('action.close')}
      title={shown.title}
      titleLines={2}
      description={shown.description}
      onDismiss={() => {
        const run = pending.current
        pending.current = null
        run?.()
      }}
    >
      <View>
        <Divided>
          {shown.actions.map((action) => (
            <Tappable
              key={action.key}
              className="min-h-md flex-row items-center gap-3 py-3"
              onPress={() => {
                pending.current = action.onPress
                onClose()
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: action.selected }}
              accessibilityLabel={action.label}
            >
              {action.icon ? <Icon {...action.icon} size={26} /> : null}
              <Text
                variant="bodyStrong"
                className={cn('flex-1', action.tone === 'danger' ? 'text-hibiscus-ink' : undefined)}
              >
                {action.label}
              </Text>
              {action.selected ? <Icon set="ui" name="check" size={22} /> : null}
            </Tappable>
          ))}
        </Divided>
      </View>
    </Sheet>
  )
}
