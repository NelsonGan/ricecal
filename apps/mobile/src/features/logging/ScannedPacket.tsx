import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { AppBar, Button, Card, Icon, Screen, Skeleton, Text } from '@/ui'

export type ScannedPacketProps = {
  /**
   * Which of the three non-answers this is.
   *
   * `looking` is the lookup still out, `missing` is nobody anywhere knowing the
   * packet, and `failed` is the transport or the session. The last two look
   * similar and are not: one is a job for the catalogue and the other is a job
   * for the network, and only the second is worth scanning the same box again
   * for.
   */
  state: 'looking' | 'missing' | 'failed'
  /** Back to the day, with the scanner open on it. */
  onRetry: () => void
  /** The path that produces a real number for a packet nobody has recorded. */
  onDescribe: () => void
  onBack: () => void
}

/**
 * The scanned packet, before there is a product to show and when there is not
 * going to be one. A scan navigates the instant the camera reads a code, so this
 * screen is where the waiting landed.
 *
 * The wait is the product page drawn empty rather than a spinner: a spinner and
 * then a full page of controls is two layouts, and the jump between them is what
 * made the old scanner feel slow.
 *
 * A miss is not an error. The packet is in the user's hand and our record of it
 * is what is missing, which is why the offer underneath is Describe.
 */
export function ScannedPacket({ state, onRetry, onDescribe, onBack }: ScannedPacketProps) {
  const { t } = useTranslation(['logging', 'common'])

  if (state === 'looking') {
    return (
      <Screen>
        {/* No title. There is nothing true to put in it yet, and a placeholder
            word would be replaced by the product's name a moment later — the
            largest text on the screen changing into something else while being
            read. */}
        <AppBar title="" onBack={onBack} backLabel={t('common:a11y.back')} />
        {/* `bg-line` rather than the default `bg-track`, which is a pale grey on
            a pale canvas — three blocks of it read as a screen that had failed
            to draw rather than one still drawing. The same choice the photo
            placeholder on the food detail screen makes. */}
        <Skeleton width="100%" height={130} rounded={false} className="rounded-card bg-line" />
        <Skeleton width="100%" height={96} rounded={false} className="rounded-card bg-line" />
        <Skeleton width="100%" height={168} rounded={false} className="rounded-card bg-line" />
      </Screen>
    )
  }

  const missing = state === 'missing'

  return (
    <Screen
      footer={
        <View className="gap-3">
          {/* Describe is the primary on a miss: it is the one that ends with the
              packet in the diary. On a failure it is the secondary, because
              scanning the same box again is likely to just work. */}
          <Button fullWidth variant={missing ? 'primary' : 'secondary'} onPress={onDescribe}>
            {t('logging:barcode.describeInstead')}
          </Button>
          <Button fullWidth variant={missing ? 'secondary' : 'primary'} onPress={onRetry}>
            {t('logging:barcode.tryAgain')}
          </Button>
        </View>
      }
    >
      <AppBar
        title={t(missing ? 'logging:barcode.missTitle' : 'logging:barcode.failedTitle')}
        onBack={onBack}
        backLabel={t('common:a11y.back')}
      />

      <Card>
        <View className="items-center gap-3 py-4">
          <Icon set="system" name="barcode" size={72} />
          <Text variant="body" className="text-center text-muted">
            {t(missing ? 'logging:barcode.unknown' : 'logging:barcode.failed')}
          </Text>
        </View>
      </Card>
    </Screen>
  )
}
