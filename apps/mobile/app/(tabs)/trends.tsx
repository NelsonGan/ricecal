import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AchievementsPanel, ActivityPanel, WeightPanel } from '@/features/progress'
import { ScreenTitle } from '@/features/shared'
import { Icon, IconButton, Screen, Tabs } from '@/ui'

type Panel = 'weight' | 'activity' | 'achievements'

/**
 * The Trends tab: P1 WEIGHT, P2 ACTIVITY and P5 ACHIEVEMENTS.
 *
 * Three designs that each keep the bottom bar, so they are panels of one route
 * rather than three routes. The deeper screens they lead to — the weekly report,
 * nutrition, a single session — are pushed and lose the bar, which is exactly
 * the distinction the design draws.
 */
export default function TrendsScreen() {
  const { t } = useTranslation('progress')
  const router = useRouter()
  const [panel, setPanel] = useState<Panel>('weight')

  return (
    <Screen>
      <ScreenTitle
        title={t(`tabs.${panel}`)}
        trailing={
          <IconButton
            size="sm"
            accessibilityLabel={t('report.title')}
            onPress={() => router.push('/progress/report')}
          >
            <Icon set="ui" name="calendar-view" size={20} />
          </IconButton>
        }
      />

      <Tabs
        options={[
          { value: 'weight', label: t('tabs.weight') },
          { value: 'activity', label: t('tabs.activity') },
          { value: 'achievements', label: t('tabs.achievements') },
        ]}
        value={panel}
        onChange={setPanel}
        accessibilityLabel={t('tabs.weight')}
      />

      {panel === 'weight' ? <WeightPanel /> : null}
      {panel === 'activity' ? <ActivityPanel /> : null}
      {panel === 'achievements' ? <AchievementsPanel /> : null}
    </Screen>
  )
}
