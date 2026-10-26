import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Card, Icon, Text } from '@/ui'

/**
 * The way into Workouts from Today: a small square beside the water card, the
 * same height and the same card. Labelled rather than an icon alone, since a
 * dumbbell on its own read as decoration in the mock-ups.
 */
export function WorkoutsTile() {
  const { t } = useTranslation('common')
  const router = useRouter()
  return (
    <Card
      flush
      className="w-[76px]"
      contentClassName="flex-1 items-center justify-center gap-1 py-2"
      onPress={() => router.push('/workouts')}
      accessibilityRole="button"
      accessibilityLabel={t('nav.workouts')}
    >
      <Icon set="body" name="dumbbell" size={28} />
      <Text variant="micro" className="text-ink" numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {t('nav.workouts')}
      </Text>
    </Card>
  )
}
