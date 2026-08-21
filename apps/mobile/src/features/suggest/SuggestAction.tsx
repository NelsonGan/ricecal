import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { MealPick, SuggestRequest } from '@/data'
import { useSuggestMeals } from '@/data'
import { announceRefusal } from '@/data/refusals'
import { track } from '@/lib/analytics'
import { useThemeColors } from '@/theme/useTheme'
import { cn, Icon, Tappable, Text, useToast } from '@/ui'
import { useRequirePro } from '../paywall'
import { AskSheet } from './AskSheet'
import { trackedCuisine } from './ask'
import { PicksSheet } from './PicksSheet'

export type SuggestActionProps = {
  /** The day the suggestion is about, and the budget it is set against. */
  date: string
  kcalLeft: number
  /** Whether this account has a budget at all, so the card can say what it fits. */
  hasBudget: boolean
  className?: string
}

/**
 * The offer on Today, and the whole flow behind it.
 *
 * The row is the entry point and it OWNS THE TWO SHEETS AND EVERYTHING IN THEM,
 * rather than Today owning any of it. This feature is a conversation with one
 * button: the question, the wait, the answers, the one being read and the way
 * back to the question. Hoisted into the screen it would be four pieces of
 * state on a file that is already the longest in the app, and every one of them
 * about something the diary does not otherwise know exists.
 *
 * The picks are ORDINARY STATE here, and they were a provider above the
 * navigator. That existed because the detail was a pushed page and a suggestion
 * has no id to put in a route; the detail is a body inside the picks sheet now,
 * so the answers never have to outlive this component — and this component is
 * on Today, which does not unmount while its own sheet is up.
 *
 * IT IS A THIN ROW UNDER THE WEEK STRIP, and it has been three other things.
 *
 * A tinted card of its own on Today, headed "Not sure what to eat?" with a line
 * about how many picks it would give — a lot of screen for an offer standing
 * between the two things the diary is about. Then a glyph on the calorie card,
 * which was the right size in the wrong place: beside a READING rather than
 * beside a decision. Then a glyph in the log sheet, beside the heading, on the
 * argument that somebody opening the sheet to add a meal is somebody who has not
 * decided what the meal is.
 *
 * That last one was true and cost too much to be worth it: the offer was two
 * taps deep, inside a sheet whose four tiles all assume the meal is settled, and
 * an account that never pressed the log button never learnt the feature existed
 * at all. On the diary itself it is one tap, it is READ on the way past, and it
 * sits directly under the day being asked about — which is the day the answer is
 * costed against. One row high, because it is an offer rather than one of the
 * things this screen is for; the ring and the meals underneath it are those.
 */
export function SuggestAction({ date, kcalLeft, hasBudget, className }: SuggestActionProps) {
  const { t } = useTranslation('suggest')
  const toast = useToast()
  const colors = useThemeColors()
  const suggest = useSuggestMeals()

  const [asking, setAsking] = useState(false)
  const [showing, setShowing] = useState(false)
  const [picks, setPicks] = useState<MealPick[]>([])
  /** What was asked to get them. Set once an answer has LANDED, not when it is sent. */
  const [request, setRequest] = useState<SuggestRequest | null>(null)
  /** Which pick the panel is showing, or null for the list. */
  const [reading, setReading] = useState<number | null>(null)

  /**
   * The paywall is pushed onto Today, from under a sheet, which is what
   * `beforePaywall` is for.
   *
   * The ask sheet is a `Sheet`, which is a native `Modal` and therefore its own
   * window above the whole app, so a paywall pushed while it is up arrives
   * behind it. The sheet closes first, and only on an actual refusal: the "still
   * checking" and "could not check" answers stay put and say so in a toast,
   * which the sheet hosts itself, rather than throwing away a form somebody has
   * just filled in.
   */
  const requirePro = useRequirePro({ beforePaywall: () => setAsking(false) })

  /**
   * Whether the panel is up, readable from inside a callback.
   *
   * `showing` itself is captured by the mutation's own handlers at the moment
   * the request is sent, when it is true by construction — so the state cannot
   * answer "is the user still watching this" ten seconds later. See `onSuccess`.
   */
  const showingRef = useRef(false)
  showingRef.current = showing

  /**
   * The last question sent, so "Try again" can send it again without asking it.
   *
   * A ref rather than `request`, which is only set once an answer has LANDED: a
   * retry pressed while the first answer was still coming would find nothing
   * there. This is written at the moment the request goes out.
   */
  const lastAsked = useRef<SuggestRequest | null>(null)

  const ask = (next: SuggestRequest) => {
    lastAsked.current = next
    setAsking(false)
    // The panel goes up BEFORE the request, holding the skeleton. Opened when
    // the answer lands, the ten seconds in between would be the diary with
    // nothing happening on it, which reads as a button that did not work.
    setShowing(true)
    // Cleared, so a second ask does not show the first ask's dishes under
    // the new question's heading for as long as the request is out. Including
    // the one being read: the panel is showing a list on its way in, and an
    // index into the answers this is about to replace points at nothing.
    setPicks([])
    setRequest(null)
    setReading(null)

    suggest.mutate(next, {
      onSuccess: (result) => {
        setPicks(result)
        setRequest(next)
        // `trackedCuisine` and never the string itself: the list is the user's
        // own now, so a cuisine is free text somebody typed. See the note there.
        track('Suggestions Shown', {
          meal: next.meal,
          cuisine: trackedCuisine(next.cuisine),
          count: result.length,
        })

        /**
         * The answer arrived and nobody is looking at it.
         *
         * A scan is claimed at the top of the endpoint, so closing the panel
         * mid-wait spends one and leaves the dishes unreachable — the row
         * asks the question again from the top, and `ask` clears them on the way
         * past. Offered rather than forced: a sheet that rises on its own, ten
         * seconds after a screen was dismissed, is the app taking the screen
         * back.
         *
         * `showingRef` and not `showing`, which is the value this closure
         * captured when the request was sent and is therefore always true.
         */
        if (showingRef.current || result.length === 0) return
        toast.show({
          title: t('ready', { count: result.length }),
          icon: { set: 'system', name: 'sparkle' },
          action: { label: t('readyAction'), onPress: () => setShowing(true) },
        })
      },
      onError: (error) => {
        setShowing(false)
        // A paywall or a spent allowance, said once, in the one place that
        // decides which. Everything else is an ordinary failure.
        if (announceRefusal(toast, error, 'suggest')) return
        toast.show({ title: t('failed'), tone: 'error' })
      },
    })
  }

  return (
    <>
      {/* ONE ROW HIGH, tinted rather than raised, and no slab under it.
       *
       * Everything raised on this screen writes something — the log button, the
       * water Add — and this writes nothing at all: it opens a question whose
       * answer is a list to read. A flat pandan tint says "offer" where a filled
       * squishy tile would say "the thing to do next", which on the diary is the
       * log button and should stay that way.
       *
       * 40pt, under the 44 floor, and deliberately: the row is as wide as the
       * screen, so the target is enormous in the direction that is actually hard
       * to hit. */}
      <Tappable
        className={cn(
          'h-[40px] flex-row items-center gap-2 rounded-md bg-pandan-soft px-3.5',
          className,
        )}
        /* NO GATE HERE, and there used to be one.
         *
         * The row opened the paywall on the first tap, which meant a free
         * account never saw what it was being sold: the question is the feature
         * — four controls, the user's own kitchens, the day's remaining budget
         * on the same line as the ceiling — and a price list shown in its place
         * is an offer with the product hidden. It also refused a tap that costs
         * nothing. Nothing is spent until the request goes out, so the gate went
         * where the spending is, on the sheet's own button. See `onAsk`. */
        onPress={() => setAsking(true)}
        accessibilityRole="button"
        accessibilityLabel={t('card.title')}
      >
        <Icon set="system" name="sparkle" size={18} />
        <Text variant="caption" className="flex-1 text-pandan-ink" numberOfLines={1}>
          {t('card.title')}
        </Text>
        {/* Tinted, like the chevron on every other row in the app. */}
        <Icon set="ui" name="chevron-right" size={16} tintColor={colors.faint} />
      </Tappable>

      <AskSheet
        visible={asking}
        onClose={() => setAsking(false)}
        /* THE GATE IS HERE, on the button that spends a scan, rather than on
           the row that opens this sheet. Refused, `requirePro` closes the sheet
           through `beforePaywall` and puts the paywall up behind it. */
        onAsk={(answers) => {
          if (!requirePro('suggest')) return
          ask({ ...answers, date })
        }}
        kcalLeft={kcalLeft}
        showLeft={hasBudget}
        busy={suggest.isPending}
      />

      <PicksSheet
        visible={showing}
        /* Back to the list on the way out, so the panel that comes up next
           opens on the answers rather than on whichever one was last read.
           Safe to do here: `onClose` fires once the panel is off screen. */
        onClose={() => {
          setShowing(false)
          setReading(null)
        }}
        request={request ?? suggest.variables ?? null}
        picks={picks}
        busy={suggest.isPending}
        /**
         * STRAIGHT TO ANOTHER LIST, not back to the question.
         *
         * So it re-sends the same request and the skeleton comes straight up in
         * place of the list. The model is not deterministic, so the same
         * question genuinely does answer differently — which is the whole reason
         * somebody presses this. Changing the question is still one tap away:
         * close the panel and the row is underneath it.
         */
        onRetry={() => {
          const again = lastAsked.current ?? request
          if (!again) return
          ask(again)
        }}
        reading={reading}
        onPressPick={setReading}
        onBack={() => setReading(null)}
      />
    </>
  )
}
