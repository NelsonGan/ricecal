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
 * How wide the picture is drawn, and so how wide it is sent.
 *
 * A CONSTANT rather than the screen's width. The capture comes out at the
 * device's pixel ratio, so a phone decides the resolution either way — but it
 * must not decide the SHAPE. Laid out against the screen, the same meal shared
 * from a small phone and a tablet would come back as two differently
 * proportioned cards, and the type on one of them would be the wrong size
 * against the plate. 340 is the frame the design system's cards are drawn on.
 */
const CARD_WIDTH = 340

/**
 * Far enough to the left that no part of the card is on the screen. Absolute,
 * so it takes no space in whatever renders it. See the root view for why it is
 * placed rather than hidden.
 */
const OFFSCREEN = { position: 'absolute', left: -(CARD_WIDTH + 40), top: 0 } as const

/**
 * The box a drawing gets, and the drawing in it.
 *
 * Not a square. An illustration is drawn at a size and stays that size, so the
 * box is only as tall as it needs to be to give one room to breathe — the
 * detail screen's own hero makes the same distinction, 298 for a photograph and
 * 198 for a drawing.
 */
const DRAWING_HEIGHT = 215
const DRAWING_SIZE = 165

/**
 * The watermark: how far down it is turned, and the one colour in this file
 * that is a literal rather than a role.
 *
 * `src/ui/README.md` says never write a colour literal, and the reason it gives
 * is that a role resolves per mode where a hex does not. That reason does not
 * reach here: what this text sits on is a PHOTOGRAPH, which is not a themed
 * surface and does not get lighter when somebody turns dark mode off. White is
 * what a watermark is on a picture, in either mode, and naming a role would be
 * asking the palette a question it has no business answering.
 *
 * Every other colour on this card is a role, including the same wordmark when
 * there is no photograph under it.
 */
const ON_PHOTO = '#FFFFFF'
const WATERMARK_OPACITY = 0.88

/** The three macro colours, in the order every chart in the app stacks them. */
const MACROS = [
  { key: 'carbs', fill: 'bg-kaya', label: 'common:macro.carbs' },
  { key: 'protein', fill: 'bg-hibiscus', label: 'common:macro.protein' },
  { key: 'fat', fill: 'bg-teh', label: 'common:macro.fat' },
] as const

/**
 * The caption's voice.
 *
 * Regular body at 11 rather than any of the `Text` variants, because every
 * variant small enough for this line is a BLACK weight — they exist for
 * headings and overlines on screens where something has to carry a section, and
 * six of them in a row read as six labels competing. `SMALL_STRONG` is for the
 * amount at the end of a phrase, which is the half anybody is reading.
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
 * NOT ON SCREEN. This is drawn off to the side of the page and captured on
 * demand — see `useMealShare` — so nothing here is laid out against a device,
 * pressed, or read by a screen reader. It exists to be photographed.
 *
 * THE PLATE IS THE CARD. A share of a meal is a share of the picture of it, so
 * the photograph takes the whole top at its own square and one caption sits
 * under it on the app's own surface. The colours are the design system's
 * unchanged — the same three macros in the same order as Today, the entry and
 * the weekly report, so somebody who has seen one of those reads this without a
 * legend — and only the type is set by hand, for the reason on `SMALL`.
 *
 * WHAT IS DELIBERATELY NOT ON IT: the day and the time it was eaten, any
 * comparison against a budget, and the portion. The first two are the diary's
 * business rather than the plate's — a card that says how far under goal
 * somebody was is a card they have to think about before sending — and the
 * third is a word that earns its width on the entry screen and not here, where
 * "serving" would be the fourth thing on a line of four already.
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
      style={{ ...OFFSCREEN, width: CARD_WIDTH }}
      className="overflow-hidden rounded-card bg-surface"
      // Out of the way is not enough on its own: nothing here may take a touch
      // meant for the page, and a screen reader must not walk into a second copy
      // of the page's own figures. The two a11y props are one platform each.
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* SQUARE FOR A PHOTOGRAPH, which is the shape the plate was framed in:
          the viewfinder is a centre crop of what the shutter records and
          `MealPhoto` crops back in by the same amount, so a square here is the
          picture the person took rather than a rectangle cut out of it.

          SHORTER FOR A DRAWING, which is the same call the detail screen makes
          about its own hero and for the same reason. An illustration has a size
          of its own and cannot fill a box the way a photograph does, so a square
          left it as a small plate adrift in a third of the card, with the empty
          tint above and below reading as a picture that failed to load.

          `bg-surface-alt` under both, which is only ever seen behind a drawing:
          the tile the diary already puts an illustration on. */}
      <View
        style={{ width: CARD_WIDTH, height: photo ? CARD_WIDTH : DRAWING_HEIGHT }}
        className="items-center justify-center overflow-hidden bg-surface-alt"
      >
        {photo ? (
          <MealPhoto source={photo} />
        ) : (
          /* Spread rather than two named props: `IconRef` is a union of
             set-and-name PAIRS, and splitting it lets a name from one set
             typecheck against another. */
          <Icon {...(icon ?? PLACEHOLDER_ICON)} size={DRAWING_SIZE} />
        )}

        {/* THE MARK, ON THE PLATE, top right, and a WATERMARK rather than a
            badge. It was a surface pill for a moment and a pill is a control:
            it read as something to press, sitting on a photograph where nothing
            is pressable, and it took a bite out of the picture to say so.
            Translucent, it belongs to the photograph instead of covering it.

            WHAT COLOUR depends on what is behind it, and the two cases are not
            the same kind of thing. A drawing sits on `surface-alt`, a themed
            surface, so the wordmark is `faint` and follows the palette like any
            other text in the app. A PHOTOGRAPH HAS NO THEME — it is whatever
            somebody's dinner looked like — so there is no role to name and the
            answer is white, the way a watermark is white everywhere.

            The honest limit: white at this weight reads on most food, and not on
            a pale plate shot from above against a white table. The badge was the
            fix for that and it cost more than it was worth. The ICON carries its
            own colours and its own frame, so even where the word fades the mark
            is still legible as ours. */}
        <View
          className="absolute right-4 top-4 flex-row items-center gap-1.5"
          style={{ opacity: WATERMARK_OPACITY }}
        >
          <Image source={MARK} style={{ width: 16, height: 16, borderRadius: 5 }} />
          <Text
            // The drawing's colour is a ROLE and follows the palette; the
            // photograph's is not one, for the reason above, so it arrives as a
            // style and the class list leaves the colour alone.
            className={cn('font-body-bold text-[12px] leading-[16px]', !photo && 'text-faint')}
            style={photo ? { color: ON_PHOTO } : undefined}
          >
            {t('logging:share.brand')}
          </Text>
        </View>
      </View>

      {/* THE CAPTION. Two lines of text and a rule between them, and the second
          line is every number on the card.

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
      </View>
    </View>
  )
}

/**
 * How a share turned out.
 *
 * Three, not a boolean, because two of them look the same from the outside and
 * mean opposite things. `failed` is the app: the capture came back with
 * nothing, and the user is owed a message. `dismissed` is somebody opening the
 * sheet and changing their mind, which is not a failure and must not be
 * announced as one.
 */
export type ShareOutcome = 'sent' | 'dismissed' | 'failed'

export type MealShare = {
  /** Goes on the card. What gets captured is whatever this points at. */
  card: RefObject<View | null>
  /** Capture and hand it to the OS. */
  share: (message: string) => Promise<ShareOutcome>
  /** A capture and a share sheet are in flight. */
  sharing: boolean
}

/**
 * Tie a share button to a `MealShareCard`.
 *
 * Straight to the OS sheet, with no preview in between. The review cards do
 * preview, and they have a reason to: a story is four screens of cards and the
 * sheet is the only thing that says WHICH of them was tapped. Here there is one
 * card, it is a picture of the plate already filling the screen behind the
 * button, and a confirmation step would be asking somebody to approve their own
 * photograph.
 */
export function useMealShare(): MealShare {
  const card = useRef<View>(null)
  const [sharing, setSharing] = useState(false)

  const share = useCallback(async (message: string): Promise<ShareOutcome> => {
    setSharing(true)
    try {
      const shot = await captureView(card)
      if (!shot) return 'failed'
      return (await sharePicture(shot, message)) ? 'sent' : 'dismissed'
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
