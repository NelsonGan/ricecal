import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Device from 'expo-device'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type BarcodeResult, useBarcodeLookup } from '@/data'
import { Button, Icon, Spinner, Text, TextField } from '@/ui'

/**
 * How tall the scanning window is.
 *
 * Shorter than the food viewfinder (310), because a barcode needs a strip and a
 * plate needs a frame: the useful area is a band across the middle of the
 * screen, and the rest of the height would only be more of the shelf. It also
 * leaves room under it for the state line, which in this panel is the part that
 * matters — a scanner with no feedback is indistinguishable from a broken one.
 */
const WINDOW_HEIGHT = 220

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
   * The code being looked up, or the last one that came back unknown.
   *
   * A simulator has no camera, so the only way to walk this flow there is to
   * type a code — which is also the honest fallback on a phone whose camera
   * cannot read a scuffed packet. Same field, both cases.
   */
  const [typed, setTyped] = useState('')

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

      {/* Always available, not only after a miss. A code that will not scan is
          the ordinary reason someone types one, and hiding the field until the
          camera has failed twice makes the fallback feel like a punishment. */}
      <View className="flex-row items-end gap-2">
        <TextField
          className="flex-1"
          label={t('logging:barcode.typeLabel')}
          placeholder={t('logging:barcode.typePlaceholder')}
          keyboardType="number-pad"
          // GTIN-14 is the longest a barcode gets. The pad reads this too:
          // with the system keyboard suppressed there is no `TextInput`
          // typing for the platform to cap, and the pad defaults to eight —
          // enough for a calorie total, five short of an EAN-13.
          maxLength={14}
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={() => typed.trim() && void submit(typed.trim())}
        />
        <Button
          variant="secondary"
          disabled={typed.trim().length < 8 || lookup.isPending}
          onPress={() => void submit(typed.trim())}
        >
          {t('logging:barcode.lookUp')}
        </Button>
      </View>

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
  // at something would be a lie. The typed field below is the whole panel there.
  return (
    <Text variant="meta">{t(hasCamera ? 'logging:barcode.aim' : 'logging:barcode.noCamera')}</Text>
  )
}
