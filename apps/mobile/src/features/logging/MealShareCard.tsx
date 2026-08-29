import { Image } from 'expo-image'
import { type Ref, type RefObject, useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { IconRef, Macros, StoredImageSource } from '@/data'
import { MealPhoto } from '@/features/shared'
import { energyShare } from '@/lib/nutrition'
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
 * And the card is square at that width, the whole card rather than the plate
 * inside it. A share is read in somebody else's feed, and every one of those
 * places crops to a square or pads to one, so a taller card loses its caption,
 * which is every figure on it.
 *
 * The plate takes whatever the caption leaves, which is why the media box is
 * `flex-1` rather than a height: the dish name runs to two lines on plenty of
 * entries, and a fixed plate would make the card square only for short names.
 */
const CARD_HEIGHT = CARD_WIDTH

/**
 * Far enough to the left that no part of the card is on the screen. Absolute,
 * so it takes no space in whatever renders it. See the root view for why it is
 * placed rather than hidden.
 */
const OFFSCREEN = { position: 'absolute', left: -(CARD_WIDTH + 40), top: 0 } as const

/**
 * The drawing, when a dish has one instead of a photograph. A size rather than a
 * box, so it is centred in whatever the caption leaves rather than filling it the
 * way a photograph does.
 */
const DRAWING_SIZE = 165

/** The three macro colours, in the order every chart in the app stacks them. */
const MACROS = [
  { key: 'carbs', fill: 'bg-kaya', label: 'common:macro.carbs' },
  { key: 'protein', fill: 'bg-hibiscus', label: 'common:macro.protein' },
  { key: 'fat', fill: 'bg-teh', label: 'common:macro.fat' },
] as const

/**
 * The caption's voice. Regular body at 11 rather than a `Text` variant, because
 * every variant small enough for this line is a black weight meant for headings,
 * and six in a row read as six labels competing. `SMALL_STRONG` is for the amount
 * at the end of a phrase.
 */
const SMALL = 'font-body text-[11px] leading-[15px]'
const SMALL_STRONG = 'font-body-bold text-[11px] leading-[15px]'

/** A dish with neither a photograph nor a drawing. The diary's own stand-in. */
const PLACEHOLDER_ICON = { set: 'food', name: 'empty-plate' } as const

/** The app icon, at the size a signature on a card wants it. */
const MARK = require('../../../assets/icon.png')

export type MealShareCardProps = {
  /** The dish, as the entry itself names it. */
  name: string
  /** What the entry counts as — the same figures the screen is showing. */
  macros: Macros
  /** The photograph, already resolved, or null for a drawing. */
  photo: StoredImageSource | null
  /** The drawing, when there is no photograph. */
  icon?: IconRef
  ref?: Ref<View>
}

/**
 * One logged meal, as a picture somebody can send.
 *
 * Not on screen: drawn off to the side of the page and captured on demand (see
 * `useMealShare`), so nothing here is laid out against a device, pressed or read
 * by a screen reader.
 *
 * The plate is the card. The photograph takes every pixel the caption does not
 * need, and the colours are the design system's unchanged, so somebody who has
 * seen Today or the weekly report reads this without a legend. Only the type is
 * set by hand, for the reason on `SMALL`.
 *
 * Square, and square-cornered: a rounded corner tells the eye a card is sitting
 * on something, and there is nothing under this one. Rounded, it arrived in a
 * feed with four wedges of whatever that app paints behind an image.
 *
 * Deliberately absent: the day and time, any comparison against a budget, and the
 * portion. The first two are the diary's business rather than the plate's, and a
 * card saying how far under goal somebody was is one they have to think about
 * before sending.
 */
export function MealShareCard({ name, macros, photo, icon, ref }: MealShareCardProps) {
  const { t } = useTranslation(['logging', 'common'])

  const split = energyShare(macros)
  const grams = { carbs: macros.carbs, protein: macros.protein, fat: macros.fat }

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
      {/* WHAT THE CAPTION LEAVES, and nothing about the plate decides it. The
          card is a fixed square and the caption is as tall as the dish name
          makes it, so this is the remainder — which is the only way both halves
          can be right at once. A height here instead, of any value, would have
          made the card square for one length of name.

          A photograph FILLS it and crops: `MealPhoto` covers whatever box it is
          given, and the viewfinder was already a centre crop of what the shutter
          recorded, so what lands here is the middle of the frame the person
          composed. A DRAWING is centred at its own size instead — an
          illustration cannot fill a box the way a photograph does, and stretched
          to one it reads as a picture that failed to load.

          `bg-surface-alt` under both, which is only ever seen behind a drawing:
          the tile the diary already puts an illustration on. */}
      <View className="w-full flex-1 items-center justify-center overflow-hidden bg-surface-alt">
        {photo ? (
          <MealPhoto source={photo} />
        ) : (
          /* Spread rather than two named props: `IconRef` is a union of
             set-and-name PAIRS, and splitting it lets a name from one set
             typecheck against another. */
          <Icon {...(icon ?? PLACEHOLDER_ICON)} size={DRAWING_SIZE} />
        )}
      </View>

      {/* THE CAPTION, and it is what makes the card square: the plate above
          takes whatever is left after this. The dish, a rule that happens to be
          three colours, every number on the card, and the app signing it.

          It started as a panel of headings — macro names in black uppercase
          over display figures, five rows deep — and what took it apart was
          asking, of each thing on it, whether somebody sending a photograph of
          their lunch meant to send that too. The ingredient list went that way:
          the most interesting thing here and still the wrong thing, because two
          wrapped lines of grey text under a photograph is a caption arguing
          with the picture above it, and the picture already shows what was on
          the plate. */}
      <View className="gap-2.5 px-card py-4">
        <Text variant="subtitle" numberOfLines={2}>
          {name}
        </Text>

        {/* The plate's own split, not a share of anybody's allowance. A hairline
            now rather than a bar: it is a rule under the name that happens to be
            three colours, and at this weight it says where the calories came
            from without asking to be read as a chart. */}
        <View className="h-1 flex-row overflow-hidden rounded-full bg-track">
          {MACROS.map((macro) =>
            split[macro.key] <= 0 ? null : (
              <View
                key={macro.key}
                className={macro.fill}
                style={{ flexGrow: split[macro.key], flexBasis: 0 }}
              />
            ),
          )}
        </View>

        {/* EVERY FIGURE ON ONE LINE, the total leading it at a size the other
            three do not compete with.

            THE TOTAL IS THE ONE NUMBER ANYBODY READS. It spent a version as a
            30pt display figure on a line of its own, which made it the loudest
            thing on the card and pushed the dish's own name into second place;
            and a version at exactly the macros' size, which was the correction
            overshooting — four figures set identically is a list, and the first
            of them is not a peer of the other three, it is their sum. 22pt bold
            against 11pt puts it back in front without giving it a line.

            The macros stepped DOWN a point to pay for it, which is also what
            keeps the row on one line: a four digit total at 22 would otherwise
            wrap "Fat" onto a second row. `flex-wrap` is still there for the
            case that does — a legend that has lost a word to truncation is a
            coloured dot meaning nothing. */}
        <View className="flex-row flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <View className="flex-row items-baseline gap-1">
            <Text className="font-display-bold text-[22px] leading-[28px] text-ink">
              {Math.round(macros.kcal).toLocaleString()}
            </Text>
            <Text className={cn(SMALL, 'text-muted')}>{t('common:unit.kcal')}</Text>
          </View>

          {MACROS.map((macro) => (
            <View key={macro.key} className="flex-row items-center gap-1.5">
              <View className={cn('h-1.5 w-1.5 rounded-full', macro.fill)} />
              <Text className={cn(SMALL, 'text-muted')}>{t(macro.label)}</Text>
              <Text className={cn(SMALL_STRONG, 'text-ink')}>
                {t('common:unit.grams', { value: Math.round(grams[macro.key]) })}
              </Text>
            </View>
          ))}
        </View>

        {/* THE SIGNATURE, and it is a line of prose rather than a mark stamped
            on the picture. It sat top right on the plate for a while, white and
            translucent, which is where a watermark goes when its job is to
            survive being cropped out of — and it bought that at the price of the
            one thing on the card anybody chose to send: it covered a corner of
            the food, and on a pale plate shot against a white tablecloth it was
            not legible anyway.

            Down here it is on a themed surface, so every colour is a ROLE again
            and the file has no hex in it. "Logged by" is `faint` and the name is
            `muted` — one phrase, with the weight on the half that is a name.
            Centred, under the figures, because it is the card signing itself
            rather than a fourth fact about the meal.

            SMALL ENOUGH TO BE READ SECOND. At 10pt against the total's 22 it is
            the last thing on the card in every sense; the icon is sized to the
            line rather than the line to the icon. */}
        <View className="flex-row items-center justify-center gap-1.5 pt-0.5">
          <Text className="font-body text-[10px] leading-[14px] text-faint">
            {t('logging:share.loggedBy')}
          </Text>
          <Image source={MARK} style={{ width: 14, height: 14, borderRadius: 4 }} />
          <Text className="font-body-bold text-[11px] leading-[14px] text-muted">
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
  card: RefObject<View | null>
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
  const card = useRef<View>(null)
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
