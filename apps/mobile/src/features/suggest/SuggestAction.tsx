import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { SuggestRequest } from '@/data'
import { useSuggestMeals } from '@/data'
import { announceRefusal } from '@/data/refusals'
import { track } from '@/lib/analytics'
import { Icon, IconButton, useToast } from '@/ui'
import { useRequirePro } from '../paywall'
import { AskSheet } from './AskSheet'
import { PicksSheet } from './PicksSheet'
import { useSuggestedPicks } from './picks'

export type SuggestActionProps = {
  /** The day the suggestion is about, and the budget it is set against. */
  date: string
  kcalLeft: number
  /** Whether this account has a budget at all, so the card can say what it fits. */
  hasBudget: boolean
}

/**
 * The sparkle on the calorie card, and the whole flow behind it.
 *
 * The card is the entry point and it OWNS THE TWO SHEETS, rather than Today
 * owning them. Everything about this feature is a conversation with one button:
 * the question, the wait, the five answers and the way back to the question.
 * Hoisted into the screen it would be three pieces of state on a file that is
 * already the longest in the app, and every one of them about something Today
 * does not otherwise know exists.
 *
 * The DETAIL is the one part that is not here, because it is a pushed page. The
 * picks reach it through `SuggestProvider` — see `picks.tsx` for why a
 * suggestion has no id to put in a route.
 *
 * IT SITS IN THE LOG SHEET, on the heading's line. That is where somebody
 * already is when the question comes up: the sheet they opened to add a meal is
 * the sheet they opened NOT knowing what the meal is, and the four ways in
 * underneath it all assume they have already decided.
 *
 * It has been two other things. A tinted card of its own on Today, headed "Not
 * sure what to eat?" with a line about how many picks it would give, which was a
 * lot of screen for an offer standing between the two things the diary is about;
 * then a glyph on the calorie card, which was the right size in the wrong place —
 * beside a reading rather than beside the decision.
 */
export function SuggestAction({ date, kcalLeft, hasBudget }: SuggestActionProps) {
  const { t } = useTranslation('suggest')
  const router = useRouter()
  const toast = useToast()
  /**
   * `replace`, because this lives inside the log sheet and the log sheet is a
   * `transparentModal`. A push from within one stacks the paywall ON the sheet,
   * half-covering it, with the sheet's own scrim still over the app — see
   * `useRequirePro`.
   */
  const requirePro = useRequirePro({ navigate: 'replace' })
  const { picks, request, set, clear, closed } = useSuggestedPicks()
  const suggest = useSuggestMeals()

  const [asking, setAsking] = useState(false)
  const [showing, setShowing] = useState(false)

  /**
   * Whether the list should come back when this screen does.
   *
   * A `Sheet` is a native `Modal`, so it draws over the whole app rather than
   * over the screen that opened it: pushed under one, the detail page arrived
   * with the list still covering it. So the sheet is closed on the way out, and
   * a ref remembers that it was the DETAIL that closed it — a dismissal by the
   * handle or the scrim must not bring it back.
   *
   * A ref rather than state because nothing renders from it, and because the
   * focus effect below would otherwise have to list it as a dependency and
   * re-run on every one of its own changes.
   */
  const reopen = useRef(false)

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
   * The list comes back when a pick's page leaves.
   *
   * Driven by the provider's counter rather than by focus: this component lives
   * inside the log sheet, which is a `transparentModal`, and the screen under a
   * transparent presentation never loses focus — so `useFocusEffect` never fired
   * and the list stayed closed after one pick had been read. See `closed` in
   * `picks.tsx`.
   *
   * The ref is still what decides: a dismissal by the handle or the scrim must
   * not bring the sheet back, and only a tap on a pick sets it.
   */
  const seen = useRef(closed)
  useEffect(() => {
    if (closed === seen.current) return
    seen.current = closed
    if (!reopen.current) return
    reopen.current = false
    setShowing(true)
  }, [closed])

  const ask = (next: SuggestRequest) => {
    setAsking(false)
    // The panel goes up BEFORE the request, holding the skeleton. Opened when
    // the answer lands, the ten seconds in between would be the diary with
    // nothing happening on it, which reads as a button that did not work.
    setShowing(true)
    // Cleared, so a second ask does not show the first ask's five dishes under
    // the new question's heading for as long as the request is out.
    clear()

    suggest.mutate(next, {
      onSuccess: (result) => {
        set(result, next)
        track('Suggestions Shown', { meal: next.meal, cuisine: next.cuisine, count: result.length })

        /**
         * The answer arrived and nobody is looking at it.
         *
         * A scan is claimed at the top of the endpoint, so closing the panel
         * mid-wait spends one and leaves the five dishes unreachable — the card
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
      {/* Raised and pandan-filled, because it is an OFFER rather than one of the
       * four ways in below it. Drawn as a fifth `QuickAction` it would read as
       * another route into the diary, and it is not one: nothing it leads to
       * writes anything.
       */}
      <IconButton
        /* As tall as the heading it sits beside, so the row is the height of
           its own title. The touch target is taken back to 44 with `hitSlop`. */
        size="xxs"
        hitSlop={8}
        variant="primary"
        /* `self-center`, because `IconButton` puts `self-start` on its own
           container and a child's own alignment beats the row's `items-center`. */
        className="self-center"
        onPress={() => {
          if (!requirePro('suggest')) return
          setAsking(true)
        }}
        accessibilityLabel={t('card.title')}
      >
        <Icon set="system" name="sparkle" size={18} />
      </IconButton>

      <AskSheet
        visible={asking}
        onClose={() => setAsking(false)}
        onAsk={(answers) => ask({ ...answers, date })}
        kcalLeft={kcalLeft}
        showLeft={hasBudget}
        busy={suggest.isPending}
      />

      <PicksSheet
        visible={showing}
        onClose={() => setShowing(false)}
        request={request ?? suggest.variables ?? null}
        picks={picks}
        busy={suggest.isPending}
        // Back to the question rather than straight to another five. "Try
        // again" after reading a list usually means "with something else" —
        // and an identical request is a second scan off the allowance for an
        // answer the user has just decided against.
        onRetry={() => {
          setShowing(false)
          setAsking(true)
        }}
        onPressPick={(index) => {
          reopen.current = true
          setShowing(false)
          router.push({ pathname: '/suggest/[index]', params: { index } })
        }}
      />
    </>
  )
}
