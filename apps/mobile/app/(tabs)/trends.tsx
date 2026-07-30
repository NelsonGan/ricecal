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
 * around one choice.
 *
 * The weekly report went the same way. It was a second reading of the same seven
 * days the diary already shows, reached from a calendar button up here that gave
 * no hint of what it opened, and every number on it was an average of numbers on
 * another screen. Nutrition — which is a real thirty-day view with fibre, sugar
 * and top dishes on it — is what the button opens now, and it says so.
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
            accessibilityLabel={t('nutrition.title')}
            onPress={() => router.push('/progress/nutrition')}
          >
            {/* A ring, not a calendar: what it opens is a macro split over thirty
                days, and the calendar promised a diary. */}
            <Icon set="ui" name="progress-ring" size={20} />
          </IconButton>
        }
      />

      <WeightPanel />
    </Screen>
  )
}
