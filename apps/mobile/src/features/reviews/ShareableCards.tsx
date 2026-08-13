import { makeImageFromView } from '@shopify/react-native-skia'
import { File, Paths } from 'expo-file-system'
import { Image } from 'expo-image'
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, Share, View } from 'react-native'

import { Button, cn, Sheet, Text } from '@/ui'

/** What a captured card is, once it is a file the OS can be handed. */
type Shot = {
  uri: string
  /** Pixels, so the preview can hold the card's own proportions. */
  width: number
  height: number
}

type Capture = (view: RefObject<View | null>) => Promise<void>

const CaptureContext = createContext<Capture | null>(null)

/**
 * A FILE PER CAPTURE, named by the instant, with the one before it deleted as
 * soon as its replacement is on disk.
 *
 * This wrote to one fixed name at first, on the reasoning that a name per shot
 * leaves PNGs in the cache nobody deletes. What that reasoning missed is the
 * rule this app already lives by: A KEY NAMES ONE OBJECT, FOR GOOD. expo-image
 * caches against the URI, so the second card tapped produced a correct file at
 * a URI the cache already had an answer for — and the sheet showed the FIRST
 * card, with its own numbers, over a Share button that would have sent the
 * right one.
 *
 * A counter was the second attempt and the same bug wearing a longer name: it
 * starts at one on every app run, so the first capture of the day collides with
 * yesterday's, which is still in the image cache on disk. The clock is the only
 * part of a capture that cannot repeat.
 */
const shotName = () => `review-card-${Date.now()}.png`

export type ShareableCardsProps = {
  /**
   * The sentence that goes out beside the picture, and INSTEAD of it on
   * Android — see `send()`.
   */
  message: string
  children: ReactNode
}

/**
 * Makes every card under it something the user can lift out and send.
 *
 * A card is tapped, it draws ITSELF into a picture, and the picture comes up in
 * a sheet with a Share button under it. The preview is the captured file rather
 * than a second rendering of the card, which is the whole reason to do it this
 * way round: what is on screen in the sheet is the exact image that leaves the
 * phone, and there is no second drawing to drift from the first.
 *
 * Skia does the capture. `makeImageFromView` is already in the app for the
 * charts, so a screenshot costs no new native module — which matters, because
 * the alternative was a dependency that needs a rebuild before anybody can try
 * this.
 *
 * A context rather than a prop on each card: a step lays out two or three cards
 * and none of them should have to be told what a story is.
 */
export function ShareableCards({ message, children }: ShareableCardsProps) {
  const { t } = useTranslation('reviews')

  const [shot, setShot] = useState<Shot | null>(null)
  const [sending, setSending] = useState(false)

  /** The capture still on disk from the last tap, deleted when it is replaced. */
  const written = useRef<string | null>(null)

  const capture = useCallback<Capture>(async (view) => {
    const image = await makeImageFromView(view as RefObject<never>)
    if (!image) return

    const file = new File(Paths.cache, shotName())
    file.create({ overwrite: true })
    file.write(image.encodeToBase64(), { encoding: 'base64' })

    // Only once the replacement exists, and outside `setShot` — an updater with
    // a side effect in it runs twice under React's development double render,
    // and the second delete would be of a file already gone.
    const stale = written.current
    written.current = file.uri
    setShot({ uri: file.uri, width: image.width(), height: image.height() })

    if (stale) {
      const old = new File(stale)
      if (old.exists) old.delete()
    }
  }, [])

  const send = useCallback(async () => {
    if (!shot) return
    setSending(true)
    try {
      /**
       * The picture on iOS, the sentence on Android.
       *
       * React Native's `Share` takes `url` on iOS only; on Android it carries
       * `message` and drops everything else, so asking it to send a file there
       * shares nothing at all and reports success. Sending the sentence is the
       * honest degradation, and it is the same sentence iOS sends beside the
       * image. Sharing the file on Android needs a content:// provider, which
       * needs a dependency, which needs a rebuild.
       */
      await Share.share(Platform.OS === 'ios' ? { url: shot.uri, message } : { message })
    } finally {
      setSending(false)
    }
  }, [message, shot])

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
          <Button fullWidth loading={sending} onPress={() => void send()}>
            {t('story.share')}
          </Button>
        }
      >
        {shot ? (
          // Held to the card's own proportions rather than a fixed height: the
          // four cards are four different shapes, and a preview that letterboxes
          // one of them is a preview of something the share does not send.
          <Image
            source={{ uri: shot.uri }}
            style={{ width: '100%', aspectRatio: shot.width / shot.height }}
            contentFit="contain"
            accessibilityLabel={t('share.preview')}
          />
        ) : null}
      </Sheet>
    </CaptureContext.Provider>
  )
}

export type ShareableProps = {
  /**
   * The card's own heading. Not drawn anywhere — the picture carries it — but a
   * screen reader has eight identical "share this card" buttons in a story
   * without it.
   */
  title: string
  children: ReactNode
  className?: string
}

/**
 * One card, liftable, with the app's mark over it FOR THE PICTURE ONLY.
 *
 * A BAND ABOVE THE CARD RATHER THAN A MARGIN AROUND IT. There was a
 * canvas-coloured margin on all four sides once, so the captured card would not
 * sit flush against the edge of the PNG, and it produced a grey block around a
 * white card inside a white sheet — a square with a visible edge, which is the
 * one seam a preview must not have. What is left is height at the TOP and
 * nothing on the other three sides: unfilled, so the sheet shows through it,
 * and enough of it that the mark has somewhere to be that no card's own header
 * has a claim on. Every card is a different shape at the top — a heading alone
 * on two of them, a heading beside a badge on another — and a mark tucked into
 * the corner of the card itself would land on one of them.
 *
 * THE MARK IS NOT ON SCREEN. It is absolutely positioned, so it costs no layout
 * and moves nothing, and it is transparent until the moment of the capture —
 * the story is a diary, not an advertisement, and three copies of a logo down a
 * page of somebody's own week is the wrong side of that. The picture that
 * leaves the phone is the one place it earns its space, because a week's
 * calories say nothing about where they came from.
 *
 * A `Pressable` rather than a wrapper with a tap handler, because it has to
 * WIN the press: the page behind it advances the story, and a nested pressable
 * claims a touch before the one around it.
 */
export function Shareable({ title, children, className }: ShareableProps) {
  const { t } = useTranslation('reviews')
  const capture = useContext(CaptureContext)
  const view = useRef<View>(null)

  /**
   * Whether the mark is showing, which is to say whether a capture is in
   * flight.
   *
   * Toggling it is a render, and a render is not a paint: `makeImageFromView`
   * reads what is ON THE SCREEN, so asking for the picture in the same tick
   * returns the card without its mark. Two frames is what it takes for the
   * toggle to reach the glass — one to commit, one to draw — which is also why
   * the mark is opacity rather than a mounted child: a layout that changed
   * would need those frames to settle as well as arrive.
   */
  const [marked, setMarked] = useState(false)

  useEffect(() => {
    if (!marked) return
    let alive = true

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        if (!alive) return
        await capture?.(view)
        if (alive) setMarked(false)
      })
    })

    return () => {
      alive = false
      cancelAnimationFrame(frame)
    }
  }, [marked, capture])

  return (
    <Pressable
      ref={view}
      onPress={() => setMarked(true)}
      className={cn('pt-6', className)}
      accessibilityRole="button"
      accessibilityLabel={t('share.card', { card: title })}
    >
      {children}

      {/* In the band above the card, right aligned, clear of whatever that
          card puts in its own top corner. Absolute, so nothing on the page
          moves when it appears. */}
      <View
        pointerEvents="none"
        className="absolute top-0.5 right-1 flex-row items-center gap-1.5"
        style={{ opacity: marked ? 1 : 0 }}
      >
        <Image source={MARK} style={{ width: 16, height: 16, borderRadius: 5 }} />
        <Text variant="micro">{t('card.brand')}</Text>
      </View>
    </Pressable>
  )
}

/** The app icon, at the size a corner of a shared card wants it. */
const MARK = require('../../../assets/icon.png')
