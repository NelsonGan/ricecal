import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { today, useDayLog, useTargets } from '@/data'
import { ItemRow, ScreenTitle } from '@/features/shared'
import { sumMacros } from '@/lib/nutrition'
import { Alert, Button, CalorieRing, Card, Icon, Screen, Text } from '@/ui'

/** Enough to show the shape of a day without turning this into the diary. */
const PREVIEW_ROWS = 2

/**
 * 10 VIEW ONLY
 *
 * What a user sees when they decline the trial: their own day, with logging
 * locked. Everything is readable, nothing is editable, and the copy says so
 * once rather than on every row.
 *
 * Their own day is the whole point, and the copy used to say "sample data" over
 * the top of it — which put the word "sample" beside a returning user's real
 * meals, and drew the ring at value = goal so an untouched day read as a budget
 * already spent. Read-only is the honest claim here; nothing on this screen is
 * invented.
 */
export default function PreviewScreen() {
  const { t } = useTranslation(['onboarding', 'logging', 'common'])
  const router = useRouter()
  const day = useDayLog(today())
  const { data: targets } = useTargets()

  const eaten = sumMacros(day.entries)
  const left = (targets?.kcal ?? 0) - eaten.kcal
  const rows = day.entries.slice(0, PREVIEW_ROWS)

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

      {/* Only with a budget behind it. A ring against a goal of zero is a full
          circle that means nothing, and the target screen has already said why
          there might not be one. */}
      {targets ? (
        // `contentClassName`, not `className`: the latter lands on the box the
        // parent measures, and centring there shrinks the card's surface to its
        // content instead of centring what is inside it.
        <Card contentClassName="items-center">
          <CalorieRing
            value={eaten.kcal}
            goal={targets.kcal}
            size={150}
            // No pinned tone: this is a real day, so kaya at 90% and hibiscus
            // past 100% mean exactly what they mean everywhere else.
            centerLabel={Math.abs(left).toLocaleString()}
            centerCaption={left < 0 ? t('logging:today.kcalOver') : t('logging:today.kcalLeft')}
          />
          <Text variant="meta" className="text-center">
            {t('onboarding:viewOnly.explainer')}
          </Text>
        </Card>
      ) : null}

      {rows.map((entry) => (
        <Card key={entry.id}>
          <ItemRow
            title={entry.foodName}
            icon={entry.icon}
            photoPath={entry.photoPath}
            value={entry.macros.kcal}
            unit="kcal"
            // The serving, the same detail line the diary shows. It used to read
            // "Breakfast, sample" on rows that are the user's own food.
            detail={`${entry.quantity > 1 ? `${entry.quantity} × ` : ''}${entry.servingLabel}`}
          />
        </Card>
      ))}

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
