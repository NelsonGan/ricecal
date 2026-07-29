import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useLogFood } from '@/features/logging'
import { getFood, type Meal } from '@/mock'
import { Button, Icon, Sheet, Spinner, Text } from '@/ui'

/**
 * Voice logging.
 *
 * Not in the screen designs, but the quick selector offers it, and a tile that
 * leads nowhere is worse than a plain one. Same shape as the camera flow: a
 * wait, then a dish from the catalogue.
 */
export default function VoiceSheet() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const params = useLocalSearchParams<{ meal?: Meal }>()
  const [listening, setListening] = useState(false)
  const logFood = useLogFood()

  const meal: Meal = params.meal ?? 'breakfast'

  const listen = () => {
    setListening(true)
    setTimeout(() => {
      logFood({ food: getFood('roti-canai'), meal, quantity: 2 })
      logFood({ food: getFood('teh-tarik'), meal })
      setListening(false)
      router.dismissAll()
    }, 1600)
  }

  return (
    <Sheet visible onClose={() => router.back()} title={t('logging:voice.title')}>
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
