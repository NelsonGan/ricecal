import { makeImageFromView } from '@shopify/react-native-skia'
import { File, Paths } from 'expo-file-system'
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
import { Platform, Pressable, Share, View } from 'react-native'

import { Button, cn, Sheet, Text } from '@/ui'

/** What a captured card is, once it is a file the OS can be handed. */
type Shot = {
  uri: string
  /** Pixels, so the preview can hold the card's own proportions. */
  width: number
  height: number
  /** The card's own heading, which the sheet takes as its title. */
  title: string
}

type Capture = (view: RefObject<View | null>, title: string) => void

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

  const capture = useCallback<Capture>((view, title) => {
    void (async () => {
      const image = await makeImageFromView(view as RefObject<never>)
      if (!image) return

      const file = new File(Paths.cache, shotName())
      file.create({ overwrite: true })
      file.write(image.encodeToBase64(), { encoding: 'base64' })

      // Only once the replacement exists, and outside `setShot` — an updater
      // with a side effect in it runs twice under React's development double
      // render, and the second delete would be of a file already gone.
      const stale = written.current
      written.current = file.uri
      setShot({ uri: file.uri, width: image.width(), height: image.height(), title })

      if (stale) {
        const old = new File(stale)
        if (old.exists) old.delete()
      }
    })()
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
        // The card's own heading. A sheet titled "Share" over a picture of a
        // card says nothing the button under it does not; the card's name says
        // WHICH of the three on the page is about to leave.
        title={shot?.title}
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
  /** The card's own heading, which titles the sheet the capture opens in. */
  title: string
  children: ReactNode
  className?: string
}

/**
 * One card, liftable, with the app's mark under it.
 *
 * THE PADDING IS PART OF THE PICTURE. The capture draws this view and nothing
 * around it, so without a margin the card's rounded corners and the slab under
 * it sit flush against the edge of the PNG and the whole thing reads as a
 * screenshot of something cut off. The page it sits on gives up the same amount
 * of its own gutter, so nothing moves on screen.
 *
 * `bg-canvas` is the other half of that: an unfilled capture comes out with a
 * transparent surround, and every app it is sent to picks its own colour for it.
 *
 * A `Pressable` rather than a wrapper with a tap handler, because it has to
 * WIN the press: the page behind it advances the story, and a nested pressable
 * claims a touch before the one around it.
 */
export function Shareable({ title, children, className }: ShareableProps) {
  const { t } = useTranslation('reviews')
  const capture = useContext(CaptureContext)
  const view = useRef<View>(null)

  return (
    <Pressable
      ref={view}
      onPress={() => capture?.(view, title)}
      className={cn('gap-2 bg-canvas p-2', className)}
      accessibilityRole="button"
      accessibilityLabel={t('share.card', { card: title })}
    >
      {children}

      {/* On every card rather than on the one that started as the share card.
          A picture of a week's calories is worth nothing to whoever receives it
          if there is no saying where it came from, and each of these leaves the
          phone on its own. */}
      <View className="flex-row items-center gap-1.5 self-end">
        <Image source={MARK} style={{ width: 16, height: 16, borderRadius: 5 }} />
        <Text variant="micro">{t('card.brand')}</Text>
      </View>
    </Pressable>
  )
}

/** The app icon, at the size a corner of a shared card wants it. */
const MARK = require('../../../assets/icon.png')
