import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Device from 'expo-device'
import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Button, Icon, Text } from '@/ui'
import { VIEWFINDER_HEIGHT } from './InlineCamera'

/**
 * How tall the scanning window is: exactly the food viewfinder's height.
 *
 * It was shorter (220), on the reasoning that a barcode needs a strip where a
 * plate needs a frame. What that missed is that the two panels live in the same
 * sheet and a person moves between them — a camera that changes size when you
 * switch tab reads as a different camera, and the smaller one reads as the
 * lesser feature. Aiming at a barcode is also easier with more of the shelf in
 * view, not less.
 */
const WINDOW_HEIGHT = VIEWFINDER_HEIGHT

/**
 * The symbologies a food packet can carry.
 *
 * EAN-13 is the world's retail barcode and what almost every Malaysian packet
 * has (the GS1 Malaysia prefix is 955, though nothing here reads it — a code is
 * a key, not a country). UPC-A and UPC-E are the American spellings, on imports.
 * EAN-8 is the small one, on things too narrow for thirteen digits: a chewing
 * gum packet, a small tin.
 *
 * QR and Data Matrix are deliberately absent. They appear on packaging all the
 * time — a marketing URL, a batch code — and scanning one would confidently look
 * up a product code that is not a product code.
 */
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const

export type BarcodePanelProps = {
  /** A code was read. Whether anything knows it is not this panel's business. */
  onScanned: (code: string) => void
}

/**
 * Scan a packet.
 *
 * The fourth way into the catalogue, and the only exact one. Snap and Describe
 * ask a model what something is; search asks the user to spell it. A barcode IS
 * the product, so there is no ranking, no candidates and no confidence here.
 *
 * THIS PANEL DOES NOT LOOK ANYTHING UP, and that is the whole shape of it now.
 * It used to: it awaited the lookup, put a spinner over the viewfinder, and
 * said which of four things was happening in a line underneath — aiming,
 * looking up, we do not know this packet, something went wrong. Three of those
 * four states were a person standing in a shop watching a camera not move,
 * because the answer can take a round trip to Open Food Facts, and the one time
 * it worked the sheet then vanished into a different screen anyway.
 *
 * So the code IS the answer as far as this panel is concerned. It reads one and
 * leaves immediately, and the page it hands the code to does the lookup and
 * owns every way that can turn out. What the user sees is a viewfinder that
 * becomes a product, rather than a viewfinder that thinks about it first.
 */
export function BarcodePanel({ onScanned }: BarcodePanelProps) {
  const { t } = useTranslation(['logging', 'common'])
  const [permission, requestPermission] = useCameraPermissions()

  /**
   * `CameraView` fires this many times a second while a code is in frame, and
   * a navigation is not instant — several more frames arrive before this panel
   * is off screen. A ref rather than state: the callback is handed to the
   * native view once, and a stale closure over `useState` would let every one
   * of them through.
   */
  const done = useRef(false)

  const scanned = useCallback(
    (code: string) => {
      if (done.current || !code) return
      done.current = true
      onScanned(code)
    },
    [onScanned],
  )

  const hasCamera = Device.isDevice

  if (permission && !permission.granted) {
    return (
      <View className="gap-3 rounded-tile bg-track p-4">
        <View className="flex-row items-center gap-2.5">
          <Icon set="system" name="barcode" size={28} />
          <Text variant="bodyStrong" className="flex-1">
            {t('logging:barcode.permissionTitle')}
          </Text>
        </View>
        <Text variant="meta">{t('logging:barcode.permissionBody')}</Text>
        <Button fullWidth onPress={requestPermission}>
          {t('logging:camera.permissionGrant')}
        </Button>
      </View>
    )
  }

  return (
    <View className="gap-3">
      <View
        className="items-center justify-center overflow-hidden rounded-tile bg-inverse"
        style={{ height: WINDOW_HEIGHT }}
      >
        {hasCamera ? (
          <CameraView
            style={{ position: 'absolute', inset: 0 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
            onBarcodeScanned={({ data }) => scanned(data)}
          />
        ) : (
          <Icon set="system" name="barcode" size={110} />
        )}

        {/* The band, not a box. It marks the strip the code has to cross, which
            is how a barcode is aimed — the four corners a QR scanner draws would
            be telling the user to frame something square. Takes no touches: the
            camera underneath is the whole surface. */}
        <View
          pointerEvents="none"
          className="absolute inset-x-8 h-[86px] rounded-2xl border-2 border-surface/80"
        />
      </View>

      {/* One line, and only one thing it can say. A simulator has no camera and
          never will, so telling the user to point it at something would be a
          lie; there is nothing else this panel can offer there, which is the
          honest thing to say. Every other state this line used to carry now
          belongs to the page the scan lands on. */}
      <Text variant="meta">
        {t(hasCamera ? 'logging:barcode.aim' : 'logging:barcode.noCamera')}
      </Text>
    </View>
  )
}
