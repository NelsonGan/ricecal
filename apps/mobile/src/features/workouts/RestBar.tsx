import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Icon, Tappable, Text } from '@/ui'
import { shortClock } from './format'

/**
 * The rest countdown, floating over the bottom of the logger while it runs.
 *
 * The figure is computed from when the rest ends rather than counted down, so
 * it is right after the phone has been locked for the whole rest, which is how
 * most rests are spent.
 */
export function RestBar({
  endsAt,
  totalS,
  now,
  onAdjust,
  onSkip,
}: {
  endsAt: number
  totalS: number
  now: number
  onAdjust: (byS: number) => void
  onSkip: () => void
}) {
  const { t } = useTranslation('workouts')
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000))
  const progress = totalS > 0 ? Math.min(1, Math.max(0, left / totalS)) : 0

  return (
    <View className="overflow-hidden rounded-card border border-kaya-soft-line bg-kaya-soft">
      <View
        className="absolute bottom-0 left-0 top-0 bg-kaya/25"
        style={{ width: `${progress * 100}%` }}
      />
      <View className="flex-row items-center gap-2 px-4 py-3">
        <Icon set="system" name="clock" size={26} />
        <View className="flex-1">
          <Text variant="overlineSm" className="text-kaya-ink">
            {t('rest.title')}
          </Text>
          {/* No live region: the figure changes every second, and TalkBack read
              every one of them out. */}
          <Text className="font-display text-[26px] leading-[34px] text-kaya-ink">
            {shortClock(left)}
          </Text>
        </View>
        <RestButton label={t('rest.minus')} onPress={() => onAdjust(-15)} />
        <RestButton label={t('rest.plus')} onPress={() => onAdjust(15)} />
        <RestButton label={t('rest.skip')} onPress={onSkip} />
      </View>
    </View>
  )
}

function RestButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tappable
      className="h-[42px] min-w-[54px] items-center justify-center rounded-md border border-kaya-soft-line bg-surface px-2"
      hitSlop={{ top: 2, bottom: 2 }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text variant="label" className="text-kaya-ink">
        {label}
      </Text>
    </Tappable>
  )
}
