import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Achievement } from '@/mock'
import { useAppState } from '@/mock'
import { useThemeColors } from '@/theme/useTheme'
import { Card, cn, Icon, Squish, Text } from '@/ui'

const tones = {
  pandan: { fill: 'bg-pandan', slab: 'bg-pandan-slab' },
  hibiscus: { fill: 'bg-hibiscus', slab: 'bg-hibiscus-slab' },
  water: { fill: 'bg-water', slab: 'bg-water-slab' },
  kaya: { fill: 'bg-kaya', slab: 'bg-kaya-slab' },
} as const

/** P5 ACHIEVEMENTS */
export function AchievementsPanel() {
  const { t } = useTranslation('progress')
  const { achievements, streak } = useAppState((state) => ({
    achievements: state.achievements,
    streak: state.streak,
  }))

  const earned = achievements.filter((badge) => badge.earned)
  const locked = achievements.filter((badge) => !badge.earned)

  return (
    <>
      <Card>
        <View className="flex-row items-center gap-4">
          <Icon set="body" name="flame-burn" size={76} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="subtitle">{t('achievements.streak', { count: streak.current })}</Text>
            <Text variant="meta">{t('achievements.best', { count: streak.best })}</Text>
          </View>
        </View>
      </Card>

      <Card title={t('achievements.earned')}>
        <BadgeGrid badges={earned} />
      </Card>

      <Card title={t('achievements.locked')}>
        <BadgeGrid badges={locked} />
      </Card>
    </>
  )
}

function BadgeGrid({ badges }: { badges: readonly Achievement[] }) {
  const { t } = useTranslation('progress')
  const colors = useThemeColors()

  return (
    <View className="flex-row flex-wrap gap-3.5">
      {badges.map((badge) => {
        const tone = tones[badge.tone]
        return (
          // Each badge is one accessible node. A screen reader announcing the
          // illustration and the caption separately would say everything twice.
          <View key={badge.id} className="w-[30%] items-center gap-2" accessible>
            <Squish
              depth={5}
              radius={22}
              slabClassName={cn('w-full', badge.earned ? tone.slab : 'bg-line-strong')}
              className={cn(
                'aspect-square items-center justify-center',
                badge.earned ? tone.fill : 'bg-track',
              )}
            >
              <Icon {...badge.icon} size={44} tintColor={badge.earned ? undefined : colors.faint} />
            </Squish>
            <Text variant="caption" className="text-center">
              {t(`achievements.badges.${badge.labelKey}`)}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
