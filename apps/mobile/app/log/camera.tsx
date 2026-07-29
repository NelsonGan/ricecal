import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Device from 'expo-device'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLogFood } from '@/features/logging'
import { useBack, useDismissTo } from '@/lib/navigation'
import { FOODS, getFood, type Meal } from '@/mock'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, IconButton, Squish, Text } from '@/ui'

type Mode = 'photo' | 'barcode'

/**
 * L3 SNAP OVER SHEET.
 *
 * The shutter does not call any recognition service. It waits, then logs a
 * dish from the catalogue — enough for the flow to be walked end to end and
 * for the result to land on Today exactly as a real detection would.
 */
export default function CameraScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const goBack = useBack('/today')
  // Logging can be three modals deep. Finishing returns to the day, not to
  // the picker the user opened two steps ago.
  const finish = useDismissTo('/today')
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const params = useLocalSearchParams<{ meal?: Meal; mode?: Mode }>()
  const [permission, requestPermission] = useCameraPermissions()
  const [analysing, setAnalysing] = useState(false)
  const logFood = useLogFood()

  const meal: Meal = params.meal ?? 'breakfast'
  const mode: Mode = params.mode ?? 'photo'

  // A simulator has no camera, so `CameraView` renders black there. Showing the
  // dish illustration instead keeps the screen reviewable without pretending a
  // feed exists.
  const hasCamera = Device.isDevice

  const capture = () => {
    setAnalysing(true)
    setTimeout(() => {
      const guess = mode === 'barcode' ? getFood('instant-noodles') : getFood('nasi-lemak-ayam')
      logFood({ food: guess, meal })
      setAnalysing(false)
      finish()
    }, 1400)
  }

  if (permission && !permission.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-inverse p-gutter">
        <Icon set="system" name="camera" size={72} />
        <Text className="text-center font-display text-[24px] leading-[30px] text-on-inverse">
          {t('logging:camera.permissionTitle')}
        </Text>
        <Text className="text-center text-on-inverse opacity-70">
          {t('logging:camera.permissionBody')}
        </Text>
        {/* Full width, because `Button` sets `self-start` on its own box and a
            plain auto-width button ignores the column's centring. */}
        <Button fullWidth onPress={requestPermission}>
          {t('logging:camera.permissionGrant')}
        </Button>
        <Button variant="ghost" fullWidth onPress={() => goBack()}>
          {t('common:action.cancel')}
        </Button>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-inverse" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between gap-3 p-4">
        <View className="flex-row items-center gap-2.5">
          <Icon set="system" name={mode === 'barcode' ? 'barcode' : 'camera'} size={24} />
          <Text className="font-display text-[18px] leading-[24px] text-on-inverse">
            {mode === 'barcode' ? t('logging:camera.barcodeTitle') : t('logging:camera.title')}
          </Text>
        </View>
        <IconButton
          size="sm"
          variant="ghost"
          accessibilityLabel={t('common:a11y.close')}
          onPress={() => goBack()}
        >
          {/* The chrome on this screen is monochrome: the illustrations carry
              their own palette, which over a camera feed reads as clutter. */}
          <Icon set="ui" name="close" size={20} tintColor={colors.onInverse} />
        </IconButton>
      </View>

      <View className="flex-1 items-center justify-center overflow-hidden">
        {hasCamera ? (
          <CameraView
            style={{ position: 'absolute', inset: 0 }}
            facing="back"
            barcodeScannerSettings={
              mode === 'barcode' ? { barcodeTypes: ['ean13', 'ean8', 'upc_a'] } : undefined
            }
          />
        ) : (
          <Icon {...FOODS[0].icon} size={184} />
        )}

        <Framing />

        <View className="absolute bottom-6 flex-row items-center gap-2.5 rounded-tile bg-inverse/80 px-3.5 py-2.5">
          {analysing ? (
            <ActivityIndicator size="small" />
          ) : (
            <View className="h-2 w-2 rounded-full bg-pandan" />
          )}
          <Text className="font-body-black text-[12px] leading-[15px] text-on-inverse">
            {analysing
              ? t('logging:camera.analysing')
              : mode === 'barcode'
                ? t('logging:camera.barcodeAiming')
                : t('logging:camera.detected')}
          </Text>
        </View>
      </View>

      <View
        className="flex-row items-center justify-between gap-3 px-5 pt-3.5"
        style={{ paddingBottom: insets.bottom || 20 }}
      >
        <IconButton
          variant="ghost"
          accessibilityLabel={t('logging:camera.library')}
          onPress={capture}
        >
          <Icon set="system" name="photo" size={26} tintColor={colors.onInverse} />
        </IconButton>

        <Squish
          depth={6}
          radius={26}
          slabClassName="bg-pandan-slab"
          className="h-[70px] w-[70px] items-center justify-center bg-pandan"
          onPress={capture}
          disabled={analysing}
          accessibilityRole="button"
          accessibilityLabel={t('logging:camera.shutter')}
          accessibilityState={{ busy: analysing }}
        >
          <Icon set="system" name="camera" size={36} />
        </Squish>

        <IconButton variant="ghost" accessibilityLabel={t('logging:camera.flip')} onPress={capture}>
          <Icon set="ui" name="refresh" size={24} tintColor={colors.onInverse} />
        </IconButton>
      </View>
    </View>
  )
}

/** The four corner brackets over the viewfinder. Decorative. */
function Framing() {
  const corner = 'absolute h-[38px] w-[38px] border-on-inverse/70'
  return (
    <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
      <View className="h-[240px] w-[240px]">
        <View
          className={`${corner} top-0 left-0 rounded-tl-[12px] border-t-[3px] border-l-[3px]`}
        />
        <View
          className={`${corner} top-0 right-0 rounded-tr-[12px] border-t-[3px] border-r-[3px]`}
        />
        <View
          className={`${corner} bottom-0 left-0 rounded-bl-[12px] border-b-[3px] border-l-[3px]`}
        />
        <View
          className={`${corner} right-0 bottom-0 rounded-br-[12px] border-r-[3px] border-b-[3px]`}
        />
      </View>
    </View>
  )
}
