import { Image } from 'expo-image'
import * as Linking from 'expo-linking'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'

import { track } from '@/lib/analytics'
import { Badge, Button, Sheet, Text, useToast } from '@/ui'
import { MONEY2TIME_LOGO, money2TimeStoreUrl } from './money2time'

export type Money2TimeSheetProps = {
  visible: boolean
  onClose: () => void
}

/**
 * The Money2Time ad, opened from its card under Me.
 *
 * A sheet before the store rather than the store straight away, so a stray tap
 * on a card marked "Ad" does not throw somebody out of the app.
 */
export function Money2TimeSheet({ visible, onClose }: Money2TimeSheetProps) {
  const { t } = useTranslation(['profile', 'common'])
  const toast = useToast()

  // Closed first, as `HelpSheet` does: the toast renders under the sheet's
  // native window and would be invisible with it still up.
  const open = () => {
    track('Money2Time Store Opened', {})
    Linking.openURL(money2TimeStoreUrl(Platform.OS)).catch(() => {
      toast.show({ title: t('profile:money2time.failed'), tone: 'error' })
    })
    onClose()
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      footer={
        <View className="gap-1">
          <Button fullWidth onPress={open}>
            {t('profile:money2time.action')}
          </Button>
          <Button variant="ghost" fullWidth onPress={onClose}>
            {t('common:action.close')}
          </Button>
        </View>
      }
    >
      <View className="items-center gap-2">
        <Image
          source={MONEY2TIME_LOGO}
          style={{ width: 88, height: 88, borderRadius: 22 }}
          contentFit="cover"
          transition={0}
          accessibilityLabel={t('profile:money2time.name')}
        />
        {/* `Badge` sets its own `self-start`, which beats this column's `items-center`. */}
        <Badge tone="neutral" size="sm" className="self-center">
          {t('profile:money2time.ad')}
        </Badge>
        <Text variant="subtitle" className="text-center">
          {t('profile:money2time.title')}
        </Text>
        <Text variant="meta" className="text-center">
          {t('profile:money2time.body')}
        </Text>
      </View>
    </Sheet>
  )
}
