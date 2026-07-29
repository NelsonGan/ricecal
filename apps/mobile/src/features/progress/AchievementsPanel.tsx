import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Achievement } from '@/data'
import { useAchievements, useStreak } from '@/data'
import { useThemeColors } from '@/theme/useTheme'
import { Card, cn, EmptyState, Icon, ProgressBar, Squish, Text } from '@/ui'

const tones = {
  pandan: { fill: 'bg-pandan', slab: 'bg-pandan-slab' },
  hibiscus: { fill: 'bg-hibiscus', slab: 'bg-hibiscus-slab' },
  water: { fill: 'bg-water', slab: 'bg-water-slab' },
  kaya: { fill: 'bg-kaya', slab: 'bg-kaya-slab' },
} as const

/** P5 ACHIEVEMENTS */
export function AchievementsPanel() {
  const { t } = useTranslation('progress')
  const achievements = useAchievements()
  const streak = useStreak()

  const earned = achievements.filter((badge) => badge.earned)
  // Closest first, so the next one to fall is the one at the top left rather
  // than whichever happens to come first in the catalogue.
  const locked = achievements
    .filter((badge) => !badge.earned)
    .sort((a, b) => b.progress - a.progress)

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
        {earned.length ? (
          <BadgeGrid badges={earned} />
        ) : (
          <EmptyState
            title={t('achievements.noneTitle')}
            description={t('achievements.noneBody')}
            icon={{ set: 'system', name: 'trophy' }}
          />
        )}
      </Card>

      {locked.length ? (
        <Card title={t('achievements.locked')}>
          <BadgeGrid badges={locked} />
        </Card>
      ) : null}
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
        // Earned badges say what earned them; locked ones say how far off it is.
        const qualifier = badge.earned
          ? t(`achievements.detail.${badge.unit}`, { count: badge.value })
          : t('achievements.progress', { value: badge.value, goal: badge.goal })

        return (
          // Each badge is one accessible node. A screen reader announcing the
          // illustration and the caption separately would say everything twice.
          <View
            key={badge.id}
            className="w-[30%] items-center gap-2"
            accessible
            accessibilityLabel={`${t(`achievements.badges.${badge.labelKey}`)}, ${
              badge.earned ? t('achievements.earnedA11y') : t('achievements.lockedA11y')
            }, ${qualifier}`}
          >
            <Squish
              depth={5}
              radius={22}
              containerClassName="w-full"
              slabClassName={badge.earned ? tone.slab : 'bg-line-strong'}
              className={cn(
                'aspect-square items-center justify-center',
                badge.earned ? tone.fill : 'bg-track',
              )}
            >
              <Icon {...badge.icon} size={44} tintColor={badge.earned ? undefined : colors.faint} />
            </Squish>

            <View className="w-full items-center gap-1">
              <Text variant="caption" className="text-center">
                {t(`achievements.badges.${badge.labelKey}`)}
              </Text>
              <Text variant="micro" className="text-center text-muted">
                {qualifier}
              </Text>
              {/* Only the locked half gets a bar. On an earned badge it would
                  be a full bar under every tile, which reads as decoration. */}
              {badge.earned ? null : (
                <ProgressBar
                  value={badge.progress}
                  tone={badge.tone}
                  height={8}
                  // Inside a grid of nine: nine bars filling at once on every
                  // visit to the tab is a light show, not feedback.
                  animateOnMount={false}
                  className="w-full"
                />
              )}
            </View>
          </View>
        )
      })}
    </View>
  )
}
