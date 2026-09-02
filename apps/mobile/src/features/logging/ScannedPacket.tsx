import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { AppBar, Button, Card, Icon, Screen, Skeleton, Text } from '@/ui'

export type ScannedPacketProps = {
  /**
   * Which of the two non-answers this is.
   *
   * `looking` is the lookup still out, and `failed` is the transport or the
   * session. There was a third — `missing`, nobody anywhere knowing the packet —
   * and it does not reach this screen any more: a miss is a job for the
   * catalogue and there is nothing here that would do it, so the detail screen
   * hands it to the camera to photograph the nutrition panel instead. A failure
   * is a job for the network, and scanning the same box again is likely to just
   * work.
   */
  state: 'looking' | 'failed'
  /** Back to the day, with the scanner open on it. */
  onRetry: () => void
  /**
   * The camera, pointed at the panel on the back of the packet. Offered here as
   * the way past a lookup that keeps failing, since the numbers are printed on
   * the thing in the user's hand either way.
   */
  onPhotographLabel: () => void
  onBack: () => void
}

/**
 * The scanned packet, while the lookup is out and when it could not be made. A
 * scan navigates the instant the camera reads a code, so this screen is where
 * the waiting landed.
 *
 * The wait is the product page drawn empty rather than a spinner: a spinner and
 * then a full page of controls is two layouts, and the jump between them is what
 * made the old scanner feel slow. It also stands in for the frame between a miss
 * being decided and the camera it is handed to coming up.
 */
export function ScannedPacket({ state, onRetry, onPhotographLabel, onBack }: ScannedPacketProps) {
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

  return (
    <Screen
      footer={
        <View className="gap-3">
          {/* Scanning again is the primary: this is a lookup that could not be
              made rather than one that came back empty, so the same box is
              likely to just work. Photographing the panel is the way past it
              when it does not. */}
          <Button fullWidth onPress={onRetry}>
            {t('logging:barcode.tryAgain')}
          </Button>
          <Button fullWidth variant="secondary" onPress={onPhotographLabel}>
            {t('logging:barcode.photographLabel')}
          </Button>
        </View>
      }
    >
      <AppBar
        title={t('logging:barcode.failedTitle')}
        onBack={onBack}
        backLabel={t('common:a11y.back')}
      />

      <Card>
        <View className="items-center gap-3 py-4">
          <Icon set="system" name="barcode" size={72} />
          <Text variant="body" className="text-center text-muted">
            {t('logging:barcode.failed')}
          </Text>
        </View>
      </Card>
    </Screen>
  )
}
