import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { createMMKV } from 'react-native-mmkv'

import { cn, Tappable, Text } from '@/ui'

/**
 * Whether a plate's parts show their macros, on the dish's ingredient card and
 * on the ingredients page alike.
 *
 * OFF BY DEFAULT. With carbs, protein and fat on every part, a five-part plate
 * read as a table, and what most people open it for is the calories. The switch
 * is one preference for both screens, so turning it on in one is what the
 * other shows when the user goes back to it, and it is remembered on the phone.
 */
const storage = createMMKV({ id: 'ricecal-logging' })
const KEY = 'partMacros'
const listeners = new Set<() => void>()

const read = () => storage.getBoolean(KEY) ?? false

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePartMacros(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, read)
  const set = (next: boolean) => {
    storage.set(KEY, next)
    for (const listener of listeners) listener()
  }
  return [on, set]
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
