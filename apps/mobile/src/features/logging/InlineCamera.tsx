import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Device from 'expo-device'
import * as ImagePicker from 'expo-image-picker'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Meal, useSelectedDate, useSnapFood } from '@/data'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, IconButton, Squish, Text } from '@/ui'

export type CameraMode = 'photo' | 'barcode'

export type InlineCameraProps = {
  mode: CameraMode
  meal: Meal
  /** Called as soon as the shot is taken, to dismiss whatever hosts this. */
  onDone: () => void
}

/**
 * The viewfinder, inside the sheet the user opened it from.
 *
 * Snapping a plate is the fastest way to log and it is one tap from Today —
 * putting it behind a full-screen route made it the one action that replaced
 * the day instead of sitting on top of it, and coming back meant dismissing
 * two screens. Inline, the day stays visible behind the sheet the whole time,
 * and the shutter is where the finger already is.
 *
 * The shutter does not wait for recognition. It writes the row and closes:
 * the waiting happens on the row itself, where the user can watch it or ignore
 * it. See `useSnapFood`.
 */
export function InlineCamera({ mode, meal, onDone }: InlineCameraProps) {
  const { t } = useTranslation(['logging', 'common'])
  const colors = useThemeColors()
  const [permission, requestPermission] = useCameraPermissions()
  // Only covers the moment between the shutter and the shot being on disk.
  // Everything after that is the row's job, not this screen's.
  const [capturing, setCapturing] = useState(false)
  const [facing, setFacing] = useState<'back' | 'front'>('back')
  const camera = useRef<CameraView>(null)
  const snapFood = useSnapFood()
  // The day being viewed, not today: a plate logged while paging back through
  // the diary belongs to the day on screen.
  const { selectedDate } = useSelectedDate()

  // A simulator has no camera, so `CameraView` renders black there. Showing the
  // dish illustration instead keeps the sheet reviewable without pretending a
  // feed exists.
  const hasCamera = Device.isDevice

  const snap = useCallback(
    (photoUri: string | undefined, source: 'camera' | 'barcode') => {
      snapFood({ meal, photoUri, source, logDate: selectedDate })
      onDone()
    },
    [snapFood, meal, onDone, selectedDate],
  )

  const capture = async () => {
    if (capturing) return
    setCapturing(true)
    // `takePictureAsync` rejects when there is no camera device, which is every
    // simulator — the flow still has to be walkable there, just without a photo.
    const photo = hasCamera
      ? await camera.current?.takePictureAsync({ quality: 0.6 }).catch(() => undefined)
      : undefined
    setCapturing(false)
    snap(photo?.uri, 'camera')
  }

  const pickFromLibrary = async () => {
    if (capturing) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
    })
    if (result.canceled) return
    snap(result.assets[0]?.uri, 'camera')
  }

  if (permission && !permission.granted) {
    return (
      <View className="gap-3 rounded-tile bg-track p-4">
        <View className="flex-row items-center gap-2.5">
          <Icon set="system" name="camera" size={28} />
          <Text variant="bodyStrong" className="flex-1">
            {t('logging:camera.permissionTitle')}
          </Text>
        </View>
        <Text variant="meta">{t('logging:camera.permissionBody')}</Text>
        <Button fullWidth onPress={requestPermission}>
          {t('logging:camera.permissionGrant')}
        </Button>
        {/* The library needs no camera permission, so a denied camera does not
            have to be the end of the flow. */}
        <Button variant="secondary" fullWidth onPress={pickFromLibrary}>
          {t('logging:camera.library')}
        </Button>
      </View>
    )
  }

  return (
    <View className="gap-3">
      <View className="h-[230px] items-center justify-center overflow-hidden rounded-tile bg-inverse">
        {hasCamera ? (
          <CameraView
            ref={camera}
            style={{ position: 'absolute', inset: 0 }}
            facing={facing}
            barcodeScannerSettings={
              mode === 'barcode' ? { barcodeTypes: ['ean13', 'ean8', 'upc_a'] } : undefined
            }
            // Scanning fires continuously while a code is in frame; the guard
            // is what stops one barcode logging six rows.
            onBarcodeScanned={
              mode === 'barcode' && !capturing
                ? () => {
                    setCapturing(true)
                    snap(undefined, 'barcode')
                  }
                : undefined
            }
          />
        ) : (
          <Icon set="food" name="empty-plate" size={132} />
        )}

        <Framing />

        <View className="absolute bottom-3 flex-row items-center gap-2 rounded-tile bg-inverse/80 px-3 py-2">
          <View className="h-2 w-2 rounded-full bg-pandan" />
          <Text variant="micro" className="text-on-inverse">
            {mode === 'barcode' ? t('logging:camera.barcodeAiming') : t('logging:camera.detected')}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between gap-3">
        <IconButton
          variant="neutral"
          accessibilityLabel={t('logging:camera.library')}
          onPress={pickFromLibrary}
          disabled={capturing}
        >
          <Icon set="system" name="photo" size={24} />
        </IconButton>

        <Squish
          depth={6}
          radius={24}
          slabClassName="bg-pandan-slab"
          className="h-[62px] w-[62px] items-center justify-center bg-pandan"
          onPress={capture}
          disabled={capturing}
          accessibilityRole="button"
          accessibilityLabel={t('logging:camera.shutter')}
          accessibilityState={{ busy: capturing }}
        >
          <Icon set="system" name="camera" size={32} />
        </Squish>

        <IconButton
          variant="neutral"
          accessibilityLabel={t('logging:camera.flip')}
          onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
          disabled={capturing || !hasCamera}
        >
          <Icon set="ui" name="refresh" size={22} tintColor={colors.ink} />
        </IconButton>
      </View>
    </View>
  )
}

/** The four corner brackets over the viewfinder. Decorative. */
function Framing() {
  const corner = 'absolute h-[30px] w-[30px] border-on-inverse/70'
  return (
    <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
      <View className="h-[168px] w-[168px]">
        <View
          className={`${corner} top-0 left-0 rounded-tl-[10px] border-t-[3px] border-l-[3px]`}
        />
        <View
          className={`${corner} top-0 right-0 rounded-tr-[10px] border-t-[3px] border-r-[3px]`}
        />
        <View
          className={`${corner} bottom-0 left-0 rounded-bl-[10px] border-b-[3px] border-l-[3px]`}
        />
        <View
          className={`${corner} right-0 bottom-0 rounded-br-[10px] border-r-[3px] border-b-[3px]`}
        />
      </View>
    </View>
  )
}
