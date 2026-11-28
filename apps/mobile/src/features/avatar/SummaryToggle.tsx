import { useTranslation } from 'react-i18next'

import { cn, Icon, Tappable } from '@/ui'
import type { SummaryView } from './preference'

/**
 * The switch in the summary card's corner, showing what a tap brings: the
 * avatar from the stats, the ring from the avatar.
 *
 * One round button rather than the two-segment pill in the mockup: the ring
 * fills the card's width, and only the corner the circle leaves free has
 * room, which holds one button and not two.
 */
export function SummaryToggle({
  value,
  onChange,
  className,
}: {
  value: SummaryView
  onChange: (view: SummaryView) => void
  className?: string
}) {
  const { t } = useTranslation('avatar')
  const next: SummaryView = value === 'stats' ? 'avatar' : 'stats'
  return (
    <Tappable
      onPress={() => onChange(next)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t(`toggle.${next}`)}
      className={cn(
        'h-8 w-8 items-center justify-center rounded-full border-2 border-line bg-surface',
        className,
      )}
    >
      <Icon set="ui" name={next === 'avatar' ? 'profile' : 'progress-ring'} size={18} />
    </Tappable>
  )
}
