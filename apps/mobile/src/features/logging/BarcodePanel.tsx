import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Device from 'expo-device'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type BarcodeResult, useBarcodeLookup } from '@/data'
import { Button, Icon, Spinner, Text } from '@/ui'
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
  /** A product was identified. The host decides what happens to it. */
  onFound: (foodId: string) => void
  /** The user gave up on a packet nothing knows: hand them to Describe. */
  onDescribe: () => void
}

/**
 * Scan a packet.
 *
 * The fourth way into the catalogue, and the only exact one. Snap and Describe
 * ask a model what something is; search asks the user to spell it. A barcode IS
 * the product, so this panel has no ranking, no candidates and no confidence —
 * it either knows the packet or it does not, and saying which is most of the
 * work here.
 *
 * The lookup is two-stage and the panel shows the difference, because the two
 * feel different: the catalogue answers in tens of milliseconds, and Open Food
 * Facts takes a second or two over a mobile connection. Without a "looking this
 * one up" state the second case reads as a scanner that missed.
 */
export function BarcodePanel({ onFound, onDescribe }: BarcodePanelProps) {
  const { t } = useTranslation(['logging', 'common'])
  const [permission, requestPermission] = useCameraPermissions()
  const lookup = useBarcodeLookup()

  const [result, setResult] = useState<BarcodeResult | null>(null)
  const [failed, setFailed] = useState(false)

  /**
   * `CameraView` fires this many times a second while a code is in frame, and
   * it will happily fire again for the same packet after an answer. A ref
   * rather than state: the callback is handed to the native view once, and a
   * stale closure over `useState` would let every frame through.
   */
  const busy = useRef(false)

  const submit = useCallback(
    async (code: string) => {
      if (busy.current) return
      busy.current = true
      setFailed(false)
      setResult(null)
      try {
        const answer = await lookup.mutateAsync(code)
        setResult(answer)
        if (answer.status === 'found') {
          onFound(answer.food.id)
          return
        }
      } catch {
        // The transport, or a session that expired mid-scan. Distinct from "no
        // such product", and the user can do something about it: point the
        // camera again.
        setFailed(true)
      } finally {
        // Only unlocked on a miss. A hit has already handed the packet to the
        // host, and unlocking would let the next frame scan the same box again
        // behind a screen that has moved on.
        busy.current = false
      }
    },
    [lookup, onFound],
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
            onBarcodeScanned={({ data }) => void submit(data)}
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
        {lookup.isPending ? (
          <View className="absolute inset-x-0 bottom-3 items-center">
            <Spinner />
          </View>
        ) : null}
      </View>

      <StateLine
        pending={lookup.isPending}
        failed={failed}
        unknown={result?.status === 'unknown'}
        hasCamera={hasCamera}
      />

      {/* No field to type a code into, and no button to look one up. Scanning
          IS the feature: the camera fires `onBarcodeScanned` many times a
          second and the answer arrives without anybody pressing anything, so a
          number pad and a Look up button next to a working scanner are two
          controls asking to do what already happened. They were there because a
          simulator has no camera and typing was the only way to walk the flow —
          which is a reason to test on a phone, not a reason to ship a form. */}
      {result?.status === 'unknown' ? (
        <Button variant="secondary" fullWidth onPress={onDescribe}>
          {t('logging:barcode.describeInstead')}
        </Button>
      ) : null}
    </View>
  )
}

/**
 * One line, saying which of four things is true.
 *
 * Split out because the branch is the interesting part and it was four nested
 * ternaries inside the layout. The order matters: a failure and a miss can both
 * be on screen after a pending, and the most recent thing that happened is what
 * the line should say.
 */
function StateLine({
  pending,
  failed,
  unknown,
  hasCamera,
}: {
  pending: boolean
  failed: boolean
  unknown: boolean
  hasCamera: boolean
}) {
  const { t } = useTranslation(['logging'])

  if (pending) return <Text variant="meta">{t('logging:barcode.looking')}</Text>
  if (failed) return <Text variant="meta">{t('logging:barcode.failed')}</Text>
  if (unknown) return <Text variant="meta">{t('logging:barcode.unknown')}</Text>
  // A simulator has no camera and never will, so telling the user to point it
  // at something would be a lie. There is nothing else this panel can offer
  // there, which is the honest thing to say.
  return (
    <Text variant="meta">{t(hasCamera ? 'logging:barcode.aim' : 'logging:barcode.noCamera')}</Text>
  )
}
