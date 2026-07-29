import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { WeightPanel } from '@/features/progress'
import { ScreenTitle } from '@/features/shared'
import { Icon, IconButton, Screen } from '@/ui'

/**
 * The Trends tab: P1 WEIGHT.
 *
 * This used to be three panels behind a `Tabs` control — weight, activity and
 * achievements. Activity had nothing to show once device sync went, and
 * achievements went with it, so a tab strip over a single panel would be chrome
 * around one choice. The deeper screens this leads to — the weekly report,
 * nutrition — are still pushed and still lose the bottom bar, which is the
 * distinction the design draws.
 */
export default function TrendsScreen() {
  const { t } = useTranslation('progress')
  const router = useRouter()

  return (
    <Screen>
      <ScreenTitle
        title={t('tabs.weight')}
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

      <WeightPanel />
    </Screen>
  )
}
