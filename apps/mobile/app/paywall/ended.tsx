import { subDays } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { dateKey, today, useCurrentWeight, useDayLog, useNutritionRange, useWeighIns } from '@/data'
import { PurchasesUnavailable, purchasePlan, purchasesAvailable } from '@/data/purchases'
import {
  trackPurchaseAbandoned,
  trackPurchaseStarted,
  useTrackPaywallShown,
} from '@/features/paywall'
import { ItemRow, ScreenTitle, StatRow } from '@/features/shared'
import { Button, Card, Icon, Screen, Text, useToast } from '@/ui'

/** W3 TRIAL ENDED */
export default function TrialEnded() {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
  const toast = useToast()
  const date = today()
  const day = useDayLog(date)
  const { data: weighIns = [] } = useWeighIns()
  const current = useCurrentWeight() ?? 0

  // What the trial actually produced, counted from the logs rather than
  // asserted: the whole point of this screen is that the numbers are theirs.
  const { data: window = [] } = useNutritionRange(dateKey(subDays(new Date(date), 30)), date)
  const loggedDays = window.length
  const meals = window.reduce((total, row) => total + (row.entry_count ?? 0), 0)
  const dropped = Math.max(0, (weighIns[0]?.kg ?? current) - current)

  const locked = day.entries.slice(0, 2)

  useTrackPaywallShown('ended')

  const resume = async () => {
    if (!purchasesAvailable()) {
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }
    trackPurchaseStarted('ended', 'yearly')
    try {
      await purchasePlan('yearly')
      router.replace('/today')
    } catch (error) {
      trackPurchaseAbandoned('ended', 'yearly', error)
      if (error instanceof PurchasesUnavailable) return
      toast.show({
        title: error instanceof Error ? error.message : t('common:action.retry'),
        tone: 'error',
      })
    }
  }

  return (
    <Screen
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={resume}>
            {t('paywall:ended.resume')}
          </Button>
          <Button variant="ghost" fullWidth onPress={() => router.replace('/today')}>
            {t('paywall:ended.browse')}
          </Button>
        </View>
      }
    >
      <ScreenTitle
        title={t('paywall:ended.heading')}
        trailing={
          <View className="flex-row items-center gap-2">
            <Icon set="system" name="lock" size={16} />
            <Text variant="caption" className="text-kaya-ink">
              {t('paywall:ended.previewMode')}
            </Text>
          </View>
        }
      />

      <Card>
        <View className="flex-row items-center gap-3.5">
          <Icon set="system" name="lock" size={46} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="bodyStrong">{t('paywall:ended.title')}</Text>
            <Text variant="meta">{t('paywall:ended.body', { days: loggedDays })}</Text>
          </View>
        </View>
      </Card>

      <Card title={t('paywall:ended.dataWaiting')}>
        <StatRow
          size="md"
          stats={[
            { key: 'days', label: t('paywall:ended.days'), value: String(loggedDays) },
            { key: 'meals', label: t('paywall:ended.meals'), value: String(meals) },
            { key: 'kg', label: t('paywall:ended.kgDown'), value: dropped.toFixed(1) },
          ]}
        />
      </Card>

      {locked.map((entry) => (
        <Card key={entry.id}>
          <ItemRow
            title={entry.foodName}
            icon={entry.icon}
            value={entry.macros.kcal}
            unit="kcal"
            detail={t('paywall:ended.lockedEntry')}
          />
        </Card>
      ))}
    </Screen>
  )
}
