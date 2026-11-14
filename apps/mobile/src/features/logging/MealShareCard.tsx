import { Image } from 'expo-image'
import { type Ref, type RefObject, useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View, type ViewInstance } from 'react-native'

import type { IconRef, Macros, StoredImageSource } from '@/data'
import { MealPhoto } from '@/features/shared'
import { captureView, sharePicture } from '@/lib/share'
import { cn, Icon, Text } from '@/ui'

/**
 * How wide the picture is drawn, and so how wide it is sent. A constant rather
 * than the screen's width: the capture comes out at the device's pixel ratio, so
 * a phone decides the resolution either way, and must not also decide the shape.
 * 340 is the frame the design system's cards are drawn on.
 */
const CARD_WIDTH = 340

/**
 * A phone's shape, 9:16, the card rather than the plate inside it. The plate is
 * the whole card, and a share mostly lands full screen: a story, a status, a
 * chat opened on a phone. Square, the photograph was a third of the picture once
 * the caption took its band.
 */
const CARD_HEIGHT = Math.round((CARD_WIDTH * 16) / 9)

/**
 * Far enough to the left that no part of the card is on the screen. Absolute,
 * so it takes no space in whatever renders it. See the root view for why it is
 * placed rather than hidden.
 */
const OFFSCREEN = { position: 'absolute', left: -(CARD_WIDTH + 40), top: 0 } as const

/**
 * The drawing, when a dish has one instead of a photograph. A size rather than a
 * box, so it is centred on the card rather than filling it the way a photograph
 * does.
 */
const DRAWING_SIZE = 165

/** The three macro colours, in the order every chart in the app stacks them. */
const MACROS = [
  { key: 'carbs', fill: 'bg-kaya', label: 'common:macro.carbs' },
  { key: 'protein', fill: 'bg-hibiscus', label: 'common:macro.protein' },
  { key: 'fat', fill: 'bg-teh', label: 'common:macro.fat' },
] as const

/**
 * The caption's two voices, one for a photograph and one for a drawing.
 *
 * Over a photograph it is white, and the figures sit in a dark glass capsule,
 * which is the one place this file names a colour rather than a role: the text
 * sits on the picture, not on a themed surface, and a role would turn it dark on
 * a dark plate in light mode. A drawing has the themed tile behind it, so it
 * takes the roles like the rest of the app, and its capsule is a card.
 */
const ON_PHOTO = {
  strong: 'text-white',
  soft: 'text-white/75',
  capsule: 'border-white/20 bg-black/45',
} as const
const ON_TILE = {
  strong: 'text-ink',
  soft: 'text-muted',
  capsule: 'border-line bg-surface',
} as const

/**
 * A light fade under the caption. Only behind a photograph: over the drawing's
 * pale tile it reads as a smudge. The capsule carries its own dark fill, so this
 * is only for the dish name and the signature, which stand on the photo itself,
 * and it stays faint enough not to read as a band.
 */
const FADE = {
  height: '34%',
  experimental_backgroundImage:
    'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 100%)',
} as const

/** Lifts white type off a busy patch of the photograph without looking drawn. */
const TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.35)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
} as const

/** A dish with neither a photograph nor a drawing. The diary's own stand-in. */
const PLACEHOLDER_ICON = { set: 'food', name: 'empty-plate' } as const

/** The app icon, at the size a signature on a card wants it. */
const MARK = require('../../../assets/app-mark.png')

export type MealShareCardProps = {
  /** The dish, as the entry itself names it. */
  name: string
  /** What the entry counts as — the same figures the screen is showing. */
  macros: Macros
  /** The photograph, already resolved, or null for a drawing. */
  photo: StoredImageSource | null
  /** The drawing, when there is no photograph. */
  icon?: IconRef
  ref?: Ref<ViewInstance>
}

/**
 * One logged meal, as a picture somebody can send.
 *
 * Not on screen: drawn off to the side of the page and captured on demand (see
 * `useMealShare`), so nothing here is laid out against a device, pressed or read
 * by a screen reader.
 *
 * The plate is the card: the photograph fills all of it, and the figures sit
 * small in a dark capsule at its foot, so the food is what gets looked at and
 * the numbers are there for whoever wants them. The colours are the design
 * system's unchanged, so somebody who has seen Today reads the dots without a
 * legend.
 *
 * Square-cornered: a rounded corner tells the eye a card is sitting on
 * something, and there is nothing under this one. Rounded, it arrived in a feed
 * with four wedges of whatever that app paints behind an image.
 *
 * Deliberately absent: the day and time, any comparison against a budget, and the
 * portion. The first two are the diary's business rather than the plate's, and a
 * card saying how far under goal somebody was is one they have to think about
 * before sending.
 */
export function MealShareCard({ name, macros, photo, icon, ref }: MealShareCardProps) {
  const { t } = useTranslation(['logging', 'common'])

  const grams = { carbs: macros.carbs, protein: macros.protein, fat: macros.fat }
  const ink = photo ? ON_PHOTO : ON_TILE
  const shadow = photo ? TEXT_SHADOW : undefined

  return (
    <View
      ref={ref}
      // Android collapses a view that draws nothing of its own out of the native
      // hierarchy, and a collapsed view has no tag for the capture to resolve.
      // This one has a fill and would survive, but the capture is the whole
      // point of it and should not depend on that staying true.
      collapsable={false}
      // OFF TO THE LEFT, AT FULL OPACITY, and the card places itself rather than
      // asking whoever renders it to remember how. Opacity is not available for
      // this: the capture multiplies a view's own alpha into what it draws, so a
      // card hidden that way comes out blank. Nor is mounting it on the tap — a
      // view has to be laid out before it has a size to capture, so that would
      // be waiting frames for the layout and then for the photograph.
      style={{ ...OFFSCREEN, width: CARD_WIDTH, height: CARD_HEIGHT }}
      className="overflow-hidden bg-surface"
      // Out of the way is not enough on its own: nothing here may take a touch
      // meant for the page, and a screen reader must not walk into a second copy
      // of the page's own figures. The two a11y props are one platform each.
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* THE PLATE, the whole card. A photograph fills it and crops:
          `MealPhoto` covers whatever box it is given, centred, so a phone-shaped
          card keeps the middle of the frame. A drawing is centred at its own
          size instead, a little above the middle so the caption does not sit on
          it; stretched to fill, it reads as a picture that failed to load.
          `bg-surface-alt` under both, which only ever shows behind a drawing. */}
      <View
        // The lift is the drawing's alone: padding here also shrinks the box a
        // photograph fills, which left a bare band at the foot.
        className={cn(
          'absolute inset-0 items-center justify-center overflow-hidden bg-surface-alt',
          !photo && 'pb-24',
        )}
      >
        {photo ? (
          <MealPhoto source={photo} />
        ) : (
          /* Spread rather than two named props: `IconRef` is a union of
             set-and-name PAIRS, and splitting it lets a name from one set
             typecheck against another. */
          <Icon {...(icon ?? PLACEHOLDER_ICON)} size={DRAWING_SIZE} />
        )}
      </View>

      {photo ? <View className="absolute inset-x-0 bottom-0" style={FADE} /> : null}

      {/* THE CAPTION, at the foot and centred: the dish in white on the photo,
          the figures in one dark glass capsule under it, the signature last.

          A light pill holding everything came first and looked pasted on: a
          white box over a photograph is a second picture. A dark, translucent
          capsule holding only the figures sits back into the food instead, and
          the name above it needs no box at all. */}
      <View className="absolute inset-x-0 bottom-0 items-center px-6 pb-5">
        <Text
          className={cn('text-center font-display-bold text-[18px] leading-[23px]', ink.strong)}
          style={shadow}
          numberOfLines={2}
        >
          {name}
        </Text>

        {/* One line of figures, the total leading. Rounded rather than a full
            pill and `flex-wrap`, for the long language that breaks it in two: a
            legend that lost a word to truncation is a coloured dot meaning
            nothing. */}
        <View
          className={cn(
            'mt-2 max-w-full flex-row flex-wrap items-baseline justify-center gap-x-3 gap-y-0.5 rounded-[16px] border px-3.5 py-2',
            ink.capsule,
          )}
        >
          <View className="flex-row items-baseline gap-1">
            <Text className={cn('font-display-bold text-[14px] leading-[18px]', ink.strong)}>
              {Math.round(macros.kcal).toLocaleString()}
            </Text>
            <Text className={cn('font-body text-[11px] leading-[15px]', ink.soft)}>
              {t('common:unit.kcal')}
            </Text>
          </View>

          {MACROS.map((macro) => (
            <View key={macro.key} className="flex-row items-center gap-1">
              <View className={cn('h-1.5 w-1.5 rounded-full', macro.fill)} />
              <Text className={cn('font-body text-[11px] leading-[15px]', ink.soft)}>
                {t(macro.label)}
              </Text>
              <Text className={cn('font-body-bold text-[11px] leading-[15px]', ink.strong)}>
                {t('common:unit.grams', { value: Math.round(grams[macro.key]) })}
              </Text>
            </View>
          ))}
        </View>

        {/* The card signing itself, last and smallest: the mark and the name,
            with no "Logged by" in front of it, which was one more phrase to read
            on a picture that is about lunch. */}
        <View className="mt-2.5 flex-row items-center gap-1.5">
          <Image source={MARK} style={{ width: 13, height: 13, borderRadius: 4 }} />
          <Text
            className={cn('font-body-bold text-[10px] leading-[13px]', ink.soft)}
            style={shadow}
          >
            {t('logging:share.brand')}
          </Text>
        </View>
      </View>
    </View>
  )
}

/**
 * How a share turned out. Three rather than a boolean, because two of them look
 * the same from outside and mean opposite things: `failed` is the capture coming
 * back with nothing, and `dismissed` is somebody changing their mind.
 */
export type ShareOutcome = 'sent' | 'dismissed' | 'failed'

export type MealShare = {
  /** Goes on the card. What gets captured is whatever this points at. */
  card: RefObject<ViewInstance | null>
  /**
   * Capture and hand it to the OS. The picture goes out alone; the sentence is
   * the Android fallback, because the share intent there cannot carry a file, and
   * iOS never sees it.
   */
  share: (androidText: string) => Promise<ShareOutcome>
  /** A capture and a share sheet are in flight. */
  sharing: boolean
}

/**
 * Tie a share button to a `MealShareCard`. Straight to the OS sheet with no
 * preview: the review cards preview because a story is four screens of cards, and
 * here there is one card already filling the screen behind the button.
 *
 * The picture alone, with no sentence beside it, since the card carries the dish
 * and the figures already. The argument exists for Android, which cannot send the
 * file at all.
 */
export function useMealShare(): MealShare {
  const card = useRef<ViewInstance>(null)
  const [sharing, setSharing] = useState(false)

  const share = useCallback(async (androidText: string): Promise<ShareOutcome> => {
    setSharing(true)
    try {
      const shot = await captureView(card)
      if (!shot) return 'failed'
      return (await sharePicture(shot, androidText, { pictureAlone: true })) ? 'sent' : 'dismissed'
    } catch {
      // Writing the file, and the share sheet itself. Neither is something the
      // screen can do anything about beyond saying so.
      return 'failed'
    } finally {
      setSharing(false)
    }
  }, [])

  return { card, share, sharing }
}
