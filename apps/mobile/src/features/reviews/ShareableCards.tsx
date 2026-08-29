import { Image } from 'expo-image'
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import { captureView, type Shot, sharePicture } from '@/lib/share'
import { spacing } from '@/theme/tokens'
import { Button, cn, Sheet, Text } from '@/ui'

type Capture = (view: RefObject<View | null>) => Promise<void>

const CaptureContext = createContext<Capture | null>(null)

export type ShareableCardsProps = {
  /**
   * The sentence that goes out beside the picture, and INSTEAD of it on
   * Android — see `send()`.
   */
  message: string
  /**
   * The share sheet closed having shared something. A callback rather than an
   * event fired here, because this component knows nothing about which review it
   * is drawing. `dismissedAction` is not reported: a sheet opened and closed is
   * not a share.
   *
   * That distinction is real on iOS only. Android's share intent never tells the
   * app what the user did, so this fires on every Android tap.
   */
  onShared?: () => void
  children: ReactNode
}

/**
 * Makes every card under it something the user can lift out and send. A card is
 * tapped, draws itself into a picture, and the picture comes up in a sheet with a
 * Share button: the preview is the captured file rather than a second rendering,
 * so what is on screen is the exact image that leaves the phone.
 *
 * `lib/share` does the capture and the sending, and the meal detail screen uses
 * the same two functions. The difference is this preview step, which a story
 * needs because it has four cards on it and a meal does not.
 *
 * A context rather than a prop on each card, so a section's two or three cards do
 * not have to be told what a review is.
 */
export function ShareableCards({ message, onShared, children }: ShareableCardsProps) {
  const { t } = useTranslation('reviews')

  const [shot, setShot] = useState<Shot | null>(null)
  const [shotIsBranded, setShotIsBranded] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)
  const [sending, setSending] = useState(false)
  const preview = useRef<View>(null)

  const capture = useCallback<Capture>(async (view) => {
    const taken = await captureView(view)
    if (taken) {
      setShotIsBranded(false)
      setPreviewReady(false)
      setShot(taken)
    }
  }, [])

  const send = useCallback(async () => {
    if (!shot || !previewReady) return
    setSending(true)
    try {
      let outgoing = shot

      if (!shotIsBranded) {
        // The first capture is the untouched on-page card. Capture the preview
        // a second time so the file handed to the OS includes the mark that
        // exists only in this sheet.
        const branded = await captureView(preview)
        if (!branded) return

        // `captureView` deletes the file it supersedes. Point the preview at
        // the new branded file immediately so a cancelled share followed by a
        // retry never reads the now-deleted clean capture. Once the image is
        // branded the overlay below is omitted, preventing a doubled mark.
        outgoing = branded
        setPreviewReady(false)
        setShotIsBranded(true)
        setShot(branded)
      }

      if (await sharePicture(outgoing, message)) onShared?.()
    } finally {
      setSending(false)
    }
  }, [message, shot, shotIsBranded, previewReady, onShared])

  return (
    <CaptureContext.Provider value={capture}>
      {children}

      <Sheet
        visible={shot !== null}
        onClose={() => setShot(null)}
        // No title. The picture under it is a card with its own heading on it,
        // and a sheet repeating that heading says the same thing twice in two
        // sizes.
        closeLabel={t('story.close')}
        scrollable={false}
        footer={
          <Button fullWidth disabled={!previewReady} loading={sending} onPress={() => void send()}>
            {t('story.share')}
          </Button>
        }
      >
        {shot ? (
          // Held to the card's own proportions rather than a fixed height: no
          // two cards on the page are the same shape, and a preview that
          // letterboxes one is a preview of something the share does not send.
          <View
            ref={preview}
            collapsable={false}
            style={{ width: '100%', aspectRatio: shot.width / shot.height }}
          >
            <Image
              source={{ uri: shot.uri }}
              style={{ position: 'absolute', inset: 0 }}
              contentFit="contain"
              onLoad={() => setPreviewReady(true)}
              accessibilityLabel={t('share.preview')}
            />
            {shotIsBranded ? null : (
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="absolute flex-row items-center gap-1.5"
                style={{ top: MARK_TOP, right: spacing.card }}
              >
                <Image source={MARK} style={{ width: 17, height: 17, borderRadius: 5 }} />
                <Text variant="micro">{t('card.brand')}</Text>
              </View>
            )}
          </View>
        ) : null}
      </Sheet>
    </CaptureContext.Provider>
  )
}

export type ShareableProps = {
  /**
   * The card's own heading. Not drawn anywhere — the picture carries it — but a
   * screen reader has eight identical "share this card" buttons down one page
   * without it.
   */
  title: string
  children: ReactNode
  className?: string
}

/**
 * One liftable card. The on-page card is captured exactly as it is; the preview
 * above adds the app's mark and is captured again only when Share is pressed.
 * Keeping the mark out of this tree means tapping can never paint it over the
 * original card for a frame while the first capture is taken.
 */
export function Shareable({ title, children, className }: ShareableProps) {
  const { t } = useTranslation('reviews')
  const capture = useContext(CaptureContext)
  const view = useRef<View>(null)

  return (
    <Pressable
      ref={view}
      onPress={() => void capture?.(view)}
      className={cn(className)}
      accessibilityRole="button"
      accessibilityLabel={t('share.card', { card: title })}
    >
      {children}
    </Pressable>
  )
}

/** The app icon, at the size a corner of a shared card wants it. */
const MARK = require('../../../assets/icon.png')

/**
 * Where the preview mark's box starts, measured against the card's padding.
 *
 * The overline it lines up with is 12pt type on a 15pt line, and the mark is
 * 17pt tall, so sitting it at the padding exactly would hang it a point below.
 */
const MARK_TOP = spacing.card - 1
