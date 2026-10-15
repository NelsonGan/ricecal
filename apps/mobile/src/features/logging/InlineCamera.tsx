import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Device from 'expo-device'
import * as ImagePicker from 'expo-image-picker'
import { type ReactNode, useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { photoCropFill } from '@/lib/photo'
import { spacing } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, IconButton, Squish, sheetBottomPadding, Text } from '@/ui'

/**
 * How tall the viewfinder is when it is NOT filling a sheet.
 *
 * Every camera in the app passes `fill` now, so this is the fallback for a host
 * that has nowhere to stretch it. It was the size of all of them, and with the
 * controls floating over its bottom edge it still left a third of the log
 * sheet empty below it, which is why `fill` exists. See README.md, "Every
 * camera fills its sheet".
 */
export const VIEWFINDER_HEIGHT = 310

/**
 * The strip along the bottom of the box the controls sit in.
 *
 * Named because two other things have to stay out of it: the framing brackets,
 * which guide where the food goes, and the fallback illustration on a device
 * with no camera. Both centre themselves in what is left rather than in the box.
 */
const CONTROL_BAND = 84

/**
 * The symbologies a food packet can carry. EAN-13 is the world's retail barcode
 * and what almost every Malaysian packet has; UPC-A and UPC-E are the American
 * spellings, on imports; EAN-8 is the small one, on things too narrow for
 * thirteen digits.
 *
 * QR and Data Matrix are deliberately absent: they appear on packaging as a
 * marketing URL or a batch code, and scanning one would confidently look up a
 * product code that is not a product code.
 */
/** The framing brackets' side, in points: never smaller than they always were. */
const FRAMING_MIN = 190
const FRAMING_MAX = 300

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const

/** Which of the two things this camera is pointed at. */
export type CaptureMode = 'meal' | 'barcode'

export type InlineCameraProps = {
  /**
   * A plate, or a packet. ONE CAMERA EITHER WAY, which is the whole reason
   * this is a mode rather than a second component.
   *
   * They were two panels with a `CameraView` each, and switching between them
   * tore one down and started the other: a black frame, a visible pause, and
   * the sense of having moved to a different feature rather than turned the
   * same camera to a different job. Sharing the view means the tabs change the
   * overlay and nothing else.
   *
   * Defaults to `meal`, so the recipe editor's picture-taking is unaffected.
   */
  mode?: CaptureMode
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
  /**
   * A code was read. Whether anything knows it is not this camera's business —
   * the page it is handed to does the lookup and owns every way that can turn
   * out. Required in `barcode` mode and ignored otherwise.
   */
  onScanned?: (code: string) => void
  /**
   * Take all the height the sheet has left, and run out past the sheet's own
   * padding to its edges and down under the home indicator. For a camera that
   * is the last thing in a full-height, non-scrolling sheet with `fillBody`,
   * which is every camera in the app. Without it the box is `VIEWFINDER_HEIGHT`
   * tall and inset like a card.
   */
  fill?: boolean
  /** Floats at the top of the feed: the meal / barcode switch, and any prompt. */
  header?: ReactNode
  /** Floats just above the shutter row: the free account's scans left. */
  footnote?: ReactNode
}

/**
 * The viewfinder, inside the sheet the user opened it from. Behind a full-screen
 * route, snapping a plate was the one action that replaced the day rather than
 * sitting on top of it, and coming back meant dismissing two screens.
 *
 * One box: the preview fills it, the controls float over the bottom, and what is
 * shown is tighter than what is captured. See `VIEWFINDER_HEIGHT` and
 * `PHOTO_CROP`.
 *
 * The library button presents its picker while this sheet is still up, because a
 * native picker cannot be presented while a modal is being dismissed: iOS cancels
 * it and the promise never settles.
 */
export function InlineCamera({
  mode = 'meal',
  onCapture,
  onScanned,
  fill,
  header,
  footnote,
}: InlineCameraProps) {
  const { t } = useTranslation(['logging', 'common'])
  const colors = useThemeColors()
  const [permission, requestPermission] = useCameraPermissions()
  // Only covers the moment between the shutter and the shot being on disk.
  // Everything after that is the row's job, not this screen's.
  const [capturing, setCapturing] = useState(false)
  const [facing, setFacing] = useState<'back' | 'front'>('back')
  const camera = useRef<CameraView>(null)
  const scanning = mode === 'barcode'
  // Measured, because in fill mode the box is whatever the sheet has left and
  // the framing has to be sized against it. So is the header, which is a pill
  // or a pill and a two-line prompt.
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [headerHeight, setHeaderHeight] = useState(0)
  // How far the sheet pads its bottom, which is how far the feed has to reach to
  // touch the edge of the screen, and what the shutter then has to clear from
  // inside it. The sides are the panel's `px-gutter`.
  const insets = useSafeAreaInsets()
  const bottomInset = fill ? sheetBottomPadding(insets.bottom) : 0
  const controlsTop = CONTROL_BAND + bottomInset
  const framing = clamp(
    Math.min(box.width * 0.72, (box.height - headerHeight - controlsTop) * 0.82),
    FRAMING_MIN,
    FRAMING_MAX,
  )

  /**
   * `CameraView` fires a scan many times a second while a code is in frame, and
   * a navigation is not instant — several more arrive before this is off
   * screen. A ref rather than state: the callback is handed to the native view
   * once, and a stale closure over `useState` would let every one of them
   * through.
   */
  const handled = useRef(false)
  const scanned = useCallback(
    (code: string) => {
      if (handled.current || !code) return
      handled.current = true
      onScanned?.(code)
    },
    [onScanned],
  )

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

  /**
   * Whether the system will still present the dialog.
   *
   * `canAskAgain` is false once iOS has a refusal on record, and from then on
   * `requestPermission` resolves denied without showing anything. Undefined on
   * a permission object that has not resolved yet, which is treated as "yes":
   * the panel is not drawn until `permission` exists at all.
   */
  const canAskForCamera = permission?.canAskAgain !== false

  if (permission && !permission.granted) {
    const card = (
      <View className="gap-3 rounded-tile bg-track p-4">
        <View className="flex-row items-center gap-2.5">
          <Icon set="system" name={scanning ? 'barcode' : 'camera'} size={28} />
          <Text variant="bodyStrong" className="flex-1">
            {t(scanning ? 'logging:barcode.permissionTitle' : 'logging:camera.permissionTitle')}
          </Text>
        </View>
        <Text variant="meta">
          {t(scanning ? 'logging:barcode.permissionBody' : 'logging:camera.permissionBody')}
        </Text>
        {/* TWO DIFFERENT BUTTONS, and which one shows is the whole point.
            `requestPermission` is a NO-OP once iOS has recorded a refusal: the
            promise resolves to the same denied status without presenting
            anything. So after a "Don't Allow" this button did nothing at all,
            for ever — the user taps it, the panel does not change, and there is
            no other way to a camera in the app. Apple's own advice for a
            feature that cannot work without a permission is to send the person
            to Settings, which is what the second branch does.

            The label is `common:action.continue` rather than "Allow camera"
            for the reason the onboarding steps carry it: guideline 5.1.1(iv)
            reads a button worded as the ask as the app doing the asking. This
            panel is a feature's empty state rather than an interstitial — the
            user came here to photograph a plate — but the wording costs nothing
            to get right and it is the last place in the app that had it. */}
        {canAskForCamera ? (
          <Button fullWidth onPress={requestPermission}>
            {t('common:action.continue')}
          </Button>
        ) : (
          <Button fullWidth onPress={() => Linking.openSettings().catch(() => {})}>
            {t('logging:camera.permissionSettings')}
          </Button>
        )}
        {/* The library needs no camera permission, so a denied camera does not
            have to be the end of the flow — for a PHOTO. There is nothing in a
            photo library that answers "what is this barcode". */}
        {scanning ? null : (
          <Button variant="secondary" fullWidth onPress={pickFromLibrary}>
            {t('logging:camera.library')}
          </Button>
        )}
      </View>
    )
    // The switch and the scans left stay, on the sheet rather than on a feed:
    // the barcode side has a refusal card of its own, and "Choose from photos"
    // still spends a scan.
    return header || footnote ? (
      <View className="gap-3">
        {header ? <View className="items-center gap-2">{header}</View> : null}
        {card}
        {footnote && !scanning ? <View className="items-center">{footnote}</View> : null}
      </View>
    ) : (
      card
    )
  }

  return (
    <View
      className={`items-center justify-center overflow-hidden bg-inverse ${fill ? 'flex-1' : 'rounded-tile'}`}
      style={
        fill
          ? { marginHorizontal: -spacing.gutter, marginBottom: -bottomInset }
          : { height: VIEWFINDER_HEIGHT }
      }
      onLayout={(event) => setBox(event.nativeEvent.layout)}
    >
      {hasCamera ? (
        /* In MEAL mode, laid out bigger than the box that shows it, so the
           viewfinder is a CENTRE CROP of what the shutter will actually record.
           See `photoCropFill` for why the shot is wider than the frame, and why
           the box is shared with the rows and screens that draw the photo back.

           The camera's own `zoom` would drive the lens and take the photograph
           with it, which is the opposite of what this is for. Both platforms
           fill-centre their preview (`resizeAspectFill` on iOS, `FILL_CENTER`
           on Android), so a view laid out larger shows a proportionally tighter
           crop on either. If a preview is ever seen spilling outside the tile on
           Android, this is what to look at first: a surface-backed child is the
           one kind that can outlive its parent's clip.

           In BARCODE mode it fills exactly instead. There is no photograph to
           keep wider than the frame, and a scanner should read what the user
           can see: cropping the preview would let a packet just off screen scan
           and hand back a product they never aimed at. */
        <CameraView
          ref={camera}
          style={scanning ? { position: 'absolute', inset: 0 } : photoCropFill}
          facing={scanning ? 'back' : facing}
          barcodeScannerSettings={scanning ? { barcodeTypes: [...BARCODE_TYPES] } : undefined}
          onBarcodeScanned={scanning ? ({ data }) => scanned(data) : undefined}
        />
      ) : (
        // Lifted clear of the controls, so the illustration reads as the subject
        // of the frame rather than as something behind the shutter. The padding
        // that lifts it still reaches down over the shutter, so like the framing
        // it takes no touches.
        <View style={{ paddingBottom: scanning ? 0 : CONTROL_BAND }} pointerEvents="none">
          {/* Two calls rather than one with the pair interpolated: `Icon` takes
              set and name as a matched pair, so a computed one does not
              typecheck — which is the point of it being a pair. */}
          {scanning ? (
            <Icon set="system" name="barcode" size={110} />
          ) : (
            <Icon set="food" name="empty-plate" size={132} />
          )}
        </View>
      )}

      {/* The band, not a box. It marks the strip the code has to cross, which
          is how a barcode is aimed — the four corners the meal framing draws
          would be telling the user to frame something square. Takes no touches:
          the camera underneath is the whole surface. */}
      {scanning ? (
        <View
          pointerEvents="none"
          className="absolute inset-x-8 h-[86px] rounded-2xl border-2 border-surface/80"
        />
      ) : box.height ? (
        // Not until the box has been measured, or the brackets draw at their
        // floor for a frame and then jump.
        <Framing top={headerHeight} bottom={controlsTop} size={Math.round(framing)} />
      ) : null}

      {header ? (
        <View
          className="absolute inset-x-0 top-0 items-center gap-2 px-4 pt-3"
          pointerEvents="box-none"
          onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        >
          {header}
        </View>
      ) : null}

      {footnote && !scanning ? (
        <View
          className="absolute inset-x-0 items-center"
          style={{ bottom: controlsTop + 10 }}
          pointerEvents="none"
        >
          {footnote}
        </View>
      ) : null}

      {/* Over the preview rather than under the box. See `VIEWFINDER_HEIGHT`:
          the height this row used to take below the frame is the height the
          frame gained.

          Absent while scanning. A barcode needs no shutter — the code IS the
          press — and a flip button would point the camera at the user's face,
          which cannot read a packet. */}
      {scanning ? null : (
        <View
          className="absolute inset-x-0 bottom-0 flex-row items-center justify-between gap-3 px-5"
          style={{ paddingBottom: 16 + bottomInset }}
        >
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
      )}
    </View>
  )
}

/**
 * The four corner brackets over the viewfinder. Decorative, and a deliberate
 * understatement: the shot is wider than they are by `PHOTO_CROP`, which is
 * what makes them safe to fill.
 */
function Framing({ top, bottom, size }: { top: number; bottom: number; size: number }) {
  const corner = 'absolute h-[30px] w-[30px] border-on-inverse/70'
  return (
    <View
      className="absolute inset-0 items-center justify-center"
      // Centred in the part of the box the controls leave, not in the box, or
      // the bottom brackets sit behind the shutter.
      style={{ paddingTop: top, paddingBottom: bottom }}
      pointerEvents="none"
    >
      <View style={{ width: size, height: size }}>
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
