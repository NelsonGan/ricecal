import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { SuggestRequest } from '@/data'
import { useSuggestMeals } from '@/data'
import { announceRefusal } from '@/data/refusals'
import { track } from '@/lib/analytics'
import { useThemeColors } from '@/theme/useTheme'
import { Card, Icon, Tappable, Text, useToast } from '@/ui'
import { useRequirePro } from '../paywall'
import { AskSheet } from './AskSheet'
import { PICK_COUNT } from './ask'
import { PicksSheet } from './PicksSheet'
import { useSuggestedPicks } from './picks'

export type SuggestCardProps = {
  /** The day the suggestion is about, and the budget it is set against. */
  date: string
  kcalLeft: number
  /** Whether this account has a budget at all, so the card can say what it fits. */
  hasBudget: boolean
}

/**
 * "Not sure what to eat?" on Today, and the whole flow behind it.
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
 * IT SITS UNDER THE RING, above the day's meals. That is where the question is
 * asked: the ring has just said how much room is left, and this is the offer to
 * do something with it.
 */
export function SuggestCard({ date, kcalLeft, hasBudget }: SuggestCardProps) {
  const { t } = useTranslation('suggest')
  const router = useRouter()
  const toast = useToast()
  const colors = useThemeColors()
  const requirePro = useRequirePro()
  const { picks, request, set, clear } = useSuggestedPicks()
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

  useFocusEffect(
    useCallback(() => {
      if (!reopen.current) return
      reopen.current = false
      setShowing(true)
    }, []),
  )

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
      {/* A tinted card rather than a white one, and the only one on this screen.
          Every other card here reports something that happened; this one offers
          something, and the offer has to be distinguishable from the diary at a
          glance or it reads as another row of the day. */}
      <Card tone="pandan" contentClassName="p-4">
        <Tappable
          className="flex-row items-center gap-3"
          onPress={() => {
            if (!requirePro('suggest')) return
            setAsking(true)
          }}
          accessibilityRole="button"
          accessibilityLabel={t('card.title')}
        >
          <View className="h-[42px] w-[42px] items-center justify-center rounded-tile bg-surface">
            <Icon set="system" name="sparkle" size={24} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="bodyStrong" className="text-heading">
              {t('card.title')}
            </Text>
            <Text variant="caption" className="text-pandan-ink">
              {/* What the picks will be measured against, when there is one.
                  A budget is the whole premise of the offer, so an account that
                  has not finished onboarding gets the plainer sentence rather
                  than "picks that fit your 0 kcal left". */}
              {hasBudget && kcalLeft > 0
                ? t('card.withBudget', { count: PICK_COUNT, kcal: kcalLeft.toLocaleString() })
                : t('card.plain', { count: PICK_COUNT })}
            </Text>
          </View>
          {/* Tinted, like every other chevron in the app: the illustration's
              own blue is the one colour on this card that means nothing. */}
          <Icon set="ui" name="chevron-right" size={18} tintColor={colors.pandanInk} />
        </Tappable>
      </Card>

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
