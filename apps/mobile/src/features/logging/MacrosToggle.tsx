import { useTranslation } from 'react-i18next'

import { useSettings, useUpdateSettings } from '@/data'
import { cn, Tappable, Text } from '@/ui'

/**
 * Whether a plate's parts show their macros, on the dish's ingredient card and
 * on the ingredients page alike.
 *
 * OFF BY DEFAULT. With carbs, protein and fat on every part, a five-part plate
 * read as a table, and what most people open it for is the calories.
 *
 * `user_settings.show_part_macros`, one setting for both screens and for the
 * account rather than the phone, so the answer is the same wherever the person
 * signs in. The settings query is optimistic and persisted, so the switch moves
 * at once and is right offline.
 */
export function usePartMacros(): [boolean, (on: boolean) => void] {
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  const on = settings?.show_part_macros ?? false
  return [on, (next) => update.mutate({ show_part_macros: next })]
}

/**
 * The switch, as a small pill in a header's top right: outlined when off,
 * filled pandan when on. A word rather than an icon, since no glyph says
 * "macros" in thirteen languages.
 */
export function MacrosToggle() {
  const { t } = useTranslation('logging')
  const [on, setOn] = usePartMacros()
  return (
    <Tappable
      onPress={() => setOn(!on)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={t('detail.macrosTitle')}
      // Drawn small to sit beside a card's title; the finger gets 44pt.
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      className={cn(
        'min-h-[28px] items-center justify-center rounded-full border-2 px-3',
        on ? 'border-pandan-soft bg-pandan-soft' : 'border-line',
      )}
    >
      <Text variant="caption" className={on ? 'text-pandan-ink' : 'text-muted'}>
        {t('detail.macrosTitle')}
      </Text>
    </Tappable>
  )
}
