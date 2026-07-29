import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Meal, useLogFood, useSelectedDate } from '@/data'
import { recogniseDish } from '@/features/logging'
import { useBack, useDismissTo } from '@/lib/navigation'
import { Button, Icon, Sheet, Spinner, Text } from '@/ui'

/**
 * Voice logging.
 *
 * Not in the screen designs, but the quick selector offers it, and a tile that
 * leads nowhere is worse than a plain one. Same seam as the camera flow: the
 * "transcription" is `recogniseDish`, which is where a real speech model will
 * go. Unlike a snap this one waits, because there is no photo to put on a row
 * in the meantime — a spinner in a sheet is honest about a two-second wait.
 */
export default function VoiceSheet() {
  const { t } = useTranslation(['logging', 'common'])
  const goBack = useBack('/today')
  // Logging can be three modals deep. Finishing returns to the day, not to
  // the picker the user opened two steps ago.
  const finish = useDismissTo('/today')
  const params = useLocalSearchParams<{ meal?: Meal }>()
  const [listening, setListening] = useState(false)
  const logFood = useLogFood()
  const { selectedDate } = useSelectedDate()

  const meal: Meal = params.meal ?? 'breakfast'

  const listen = async () => {
    setListening(true)
    try {
      const heard = await recogniseDish('photo')
      await logFood.mutateAsync({
        foodId: heard.foodId,
        servingId: heard.servingId,
        meal,
        logDate: selectedDate,
        source: 'voice',
      })
      finish()
    } finally {
      setListening(false)
    }
  }

  return (
    <Sheet visible onClose={() => goBack()} title={t('logging:voice.title')}>
      <View className="items-center gap-4 py-4">
        {listening ? (
          <Spinner label={t('logging:voice.listening')} />
        ) : (
          <Icon set="system" name="microphone" size={72} />
        )}
        <Text variant="meta" className="text-center">
          {t('logging:voice.hint')}
        </Text>
      </View>

      <Button fullWidth onPress={listen} loading={listening}>
        {listening ? t('logging:voice.stop') : t('logging:voice.listening')}
      </Button>
    </Sheet>
  )
}
