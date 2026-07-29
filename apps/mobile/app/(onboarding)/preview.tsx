import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { ItemRow, ScreenTitle } from '@/features/shared'
import { entriesForMeal, entryMacros, getFood, useAppState, useSelectedDay } from '@/mock'
import { Alert, Button, CalorieRing, Card, Icon, Screen, Text } from '@/ui'

/**
 * 10 VIEW ONLY
 *
 * What a user sees when they decline the trial: the real shape of a day, drawn
 * from the same seed data, with logging locked. Everything is readable, nothing
 * is editable, and the copy says so once rather than on every row.
 */
export default function PreviewScreen() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const day = useSelectedDay()
  const targets = useAppState((state) => state.targets)

  const sample = entriesForMeal(day, 'breakfast').slice(0, 2)

  return (
    <Screen
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={() => router.replace('/paywall')}>
            {t('onboarding:viewOnly.unlock')}
          </Button>
        </View>
      }
    >
      <ScreenTitle title={t('common:nav.today')} />

      <Alert
        tone="warning"
        title={t('onboarding:viewOnly.banner')}
        icon={{ set: 'system', name: 'lock' }}
      />

      <Card className="items-center">
        <CalorieRing
          value={targets.kcal}
          goal={targets.kcal}
          size={150}
          centerLabel={targets.kcal.toLocaleString()}
          centerCaption={t('onboarding:viewOnly.sampleDay')}
        />
        <Text variant="meta" className="text-center">
          {t('onboarding:viewOnly.explainer')}
        </Text>
      </Card>

      {sample.map((entry) => {
        const food = getFood(entry.foodId)
        return (
          <Card key={entry.id}>
            <ItemRow
              title={food.name}
              icon={food.icon}
              value={entryMacros(entry).kcal}
              unit="kcal"
              detail={t('onboarding:viewOnly.sampleMeal')}
            />
          </Card>
        )
      })}

      <Card tone="kaya">
        <View className="flex-row items-start gap-3.5">
          <View className="h-10 w-10 items-center justify-center rounded-sm bg-kaya">
            <Icon set="system" name="lock" size={22} />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="bodyStrong" className="text-kaya-ink">
              {t('onboarding:viewOnly.lockedTitle')}
            </Text>
            <Text variant="meta">{t('onboarding:viewOnly.lockedBody')}</Text>
          </View>
        </View>
      </Card>
    </Screen>
  )
}
