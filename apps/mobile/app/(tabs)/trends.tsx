import { useTranslation } from 'react-i18next'

import { WeightPanel } from '@/features/progress'
import { ScreenTitle } from '@/features/shared'
import { Screen } from '@/ui'

/**
 * The Trends tab: weight, and only weight.
 *
 * It used to be three panels behind a `Tabs` control — weight, activity and
 * achievements. Activity had nothing to show once device sync went and
 * achievements went with it, so a tab strip over a single panel would have been
 * chrome around one choice.
 *
 * The two screens this used to lead to are both gone as well. The weekly report
 * was a second reading of the seven days the diary already shows; the thirty-day
 * nutrition view was averages of the same rows again, with fibre and sugar
 * estimated from carbohydrate for the most of the catalogue that records neither.
 * Both hung off one unlabelled button in the corner, which is where a screen goes
 * when nobody is sure it earns a place.
 */
export default function TrendsScreen() {
  const { t } = useTranslation('progress')

  return (
    <Screen>
      <ScreenTitle title={t('tabs.weight')} />
      <WeightPanel />
    </Screen>
  )
}
