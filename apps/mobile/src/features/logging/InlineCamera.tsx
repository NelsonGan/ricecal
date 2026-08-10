import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Device from 'expo-device'
import * as ImagePicker from 'expo-image-picker'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, IconButton, Squish, Text } from '@/ui'

/**
 * How tall the viewfinder is.
 *
 * Sized against the sheet that has the least room — the quick selector, whose
 * body is capped at 440pt with a title and four squares already in it — and it
 * is the CONTROLS moving onto the preview that pays for the extra height. A row
 * of buttons under the frame cost 80pt of a panel that had none to spare, so the
 * box grew by exactly that and the shutter now floats over the bottom of it,
 * which is where a camera puts it anyway. The sheet is the same size it was; the
 * picture in it is a third bigger.
 */
const VIEWFINDER_HEIGHT = 310

/**
 * The strip along the bottom of the box the controls sit in.
 *
 * Named because two other things have to stay out of it: the framing brackets,
 * which guide where the food goes, and the fallback illustration on a device
 * with no camera. Both centre themselves in what is left rather than in the box.
 */
const CONTROL_BAND = 84

/**
 * How much bigger the preview is laid out than the box that shows it.
 *
 * The viewfinder is a CENTRE CROP of what the shutter will actually record, and
 * the asymmetry is the point. People fill the frame they are given, so whatever
 * the frame shows is what ends up at the very edges of the shot — and a plate
 * cropped at its rim is a plate with nothing beside it to judge the size of. A
 * preview tighter than the capture means the food they centred comes back with
 * the table, the cutlery and the rest of the plate around it, which is the
 * context the cascade reads a portion out of.
 *
 * This is LAYOUT rather than the camera's own `zoom`, which drives the lens and
 * would take the photograph with it. A transform would be applied after layout,
 * to a view whose contents are a native preview surface rather than anything
 * React Native draws — so the view is genuinely laid out larger instead, and the
 * tile's `overflow-hidden` crops it the same way it crops any other child.
 *
 * Both platforms fill-centre their preview (`resizeAspectFill` on iOS,
 * `FILL_CENTER` on Android), so a view a quarter larger shows a proportionally
 * tighter crop on either. If a preview is ever seen spilling outside the tile on
 * Android, this is what to look at first: a surface-backed child is the one kind
 * that can outlive its parent's clip.
 */
const PREVIEW_ZOOM = 1.25

/** Percentages, for a box whose width is only known once it is laid out. */
const pct = (value: number): `${number}%` => `${value}%`

const previewStyle = {
  position: 'absolute',
  width: pct(PREVIEW_ZOOM * 100),
  height: pct(PREVIEW_ZOOM * 100),
  // Half the overhang pulled back on each axis, so what is cropped away is
  // shared evenly and the middle of the preview is the middle of the shot.
  left: pct((1 - PREVIEW_ZOOM) * 50),
  top: pct((1 - PREVIEW_ZOOM) * 50),
} as const

export type InlineCameraProps = {
  /**
   * The shot, as a local `file://` uri — and `undefined` from a device that has no
   * camera, which is every simulator. The host decides what that means: the quick
   * selector logs a snap with no photo, and the picture picker has nothing to
   * attach.
   *
   * The host owns this because the two want opposite things from the same shutter.
   * One is starting a new entry from a photo; the other is putting a picture on an
   * entry that already exists.
   */
  onCapture: (photoUri: string | undefined) => void
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
 * It is one box: the preview fills it, the controls float over the bottom of it,
 * and what is shown is deliberately tighter than what is captured. See
 * `VIEWFINDER_HEIGHT` and `PREVIEW_ZOOM`.
 *
 * The library button presents its picker while this sheet is still up, on purpose.
 * A native picker cannot be presented while a modal is being DISMISSED — iOS
 * cancels it and the promise never settles — so the sheet closes after a photo
 * comes back, never before.
 */
export function InlineCamera({ onCapture }: InlineCameraProps) {
  const { t } = useTranslation(['logging', 'common'])
  const colors = useThemeColors()
  const [permission, requestPermission] = useCameraPermissions()
  // Only covers the moment between the shutter and the shot being on disk.
  // Everything after that is the row's job, not this screen's.
  const [capturing, setCapturing] = useState(false)
  const [facing, setFacing] = useState<'back' | 'front'>('back')
  const camera = useRef<CameraView>(null)

  // A simulator has no camera, so `CameraView` renders black there. Showing the
  // dish illustration instead keeps the sheet reviewable without pretending a
  // feed exists.
  const hasCamera = Device.isDevice

  const capture = async () => {
    if (capturing) return
    setCapturing(true)
    // `takePictureAsync` rejects when there is no camera device, which is every
    // simulator — the flow still has to be walkable there, just without a photo.
    const photo = hasCamera
      ? await camera.current?.takePictureAsync({ quality: 0.6 }).catch(() => undefined)
      : undefined
    setCapturing(false)
    onCapture(photo?.uri)
  }

  const pickFromLibrary = async () => {
    if (capturing) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
    })
    if (result.canceled) return
    onCapture(result.assets[0]?.uri)
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
    <View
      className="items-center justify-center overflow-hidden rounded-tile bg-inverse"
      style={{ height: VIEWFINDER_HEIGHT }}
    >
      {hasCamera ? (
        <CameraView ref={camera} style={previewStyle} facing={facing} />
      ) : (
        // Lifted clear of the controls, so the illustration reads as the subject
        // of the frame rather than as something behind the shutter. The padding
        // that lifts it still reaches down over the shutter, so like the framing
        // it takes no touches.
        <View style={{ paddingBottom: CONTROL_BAND }} pointerEvents="none">
          <Icon set="food" name="empty-plate" size={132} />
        </View>
      )}

      <Framing />

      {/* Over the preview rather than under the box. See `VIEWFINDER_HEIGHT`:
          the height this row used to take below the frame is the height the
          frame gained. */}
      <View className="absolute inset-x-0 bottom-0 flex-row items-center justify-between gap-3 px-4 pb-4">
        {/* `self-center` on both, because `IconButton` sets `self-start` on its
            own box and that quietly beat the row's `items-center`: the two side
            buttons are 61pt to the shutter's 68, so they hung 7pt high. Under
            the frame that read as a wobble in a row of three; on the frame, with
            the shutter's own bottom edge setting the inset, it read as the side
            buttons floating. */}
        <IconButton
          className="self-center"
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
          className="self-center"
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

/**
 * The four corner brackets over the viewfinder. Decorative, and a lie by a
 * quarter: the shot is wider than they are (see `PREVIEW_ZOOM`), which is what
 * makes them safe to fill.
 */
function Framing() {
  const corner = 'absolute h-[30px] w-[30px] border-on-inverse/70'
  return (
    <View
      className="absolute inset-0 items-center justify-center"
      // Centred in the part of the box the controls leave, not in the box, or
      // the bottom brackets sit behind the shutter.
      style={{ paddingBottom: CONTROL_BAND }}
      pointerEvents="none"
    >
      <View className="h-[190px] w-[190px]">
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
