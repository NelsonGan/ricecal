import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { FoodRow, ScreenTitle, StatRow } from '@/features/shared'
import { entryMacros, getFood, useAppState, useDispatch, useSelectedDay, useStore } from '@/mock'
import { Button, Card, Icon, Screen, Text } from '@/ui'

/** W3 TRIAL ENDED */
export default function TrialEnded() {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
  const dispatch = useDispatch()
  const { state } = useStore()
  const day = useSelectedDay()
  const { profile, weighIns } = useAppState((s) => ({
    profile: s.profile,
    weighIns: s.weighIns,
  }))

  const loggedDays = Object.values(state.days).filter((entry) => entry.entries.length > 0)
  const meals = loggedDays.reduce((total, entry) => total + entry.entries.length, 0)
  const dropped = Math.max(0, (weighIns[0]?.kg ?? profile.weightKg) - profile.weightKg)

  const locked = day.entries.slice(0, 2)

  return (
    <Screen
      footer={
        <View className="gap-1.5">
          <Button
            fullWidth
            onPress={() => {
              dispatch({ type: 'setSubscription', status: 'active' })
              router.replace('/today')
            }}
          >
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
            <Text variant="meta">{t('paywall:ended.body', { days: loggedDays.length })}</Text>
          </View>
        </View>
      </Card>

      <Card title={t('paywall:ended.dataWaiting')}>
        <StatRow
          size="md"
          stats={[
            { key: 'days', label: t('paywall:ended.days'), value: String(loggedDays.length) },
            { key: 'meals', label: t('paywall:ended.meals'), value: String(meals) },
            { key: 'kg', label: t('paywall:ended.kgDown'), value: dropped.toFixed(1) },
          ]}
        />
      </Card>

      {locked.map((entry) => {
        const food = getFood(entry.foodId)
        return (
          <Card key={entry.id}>
            <FoodRow
              name={food.name}
              icon={food.icon}
              kcal={entryMacros(entry).kcal}
              detail={t('paywall:ended.lockedEntry', { meal: t(`common:meal.${entry.meal}`) })}
            />
          </Card>
        )
      })}
    </Screen>
  )
}
