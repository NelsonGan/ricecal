import * as Linking from 'expo-linking'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

// The leaf rather than `@/features/settings`, which is the one place in this
// file that breaks the barrel habit. That barrel exports `LanguageSync`, which
// imports `@/data`, which pulls the whole router and half the native modules in
// behind a single string constant.
import { DISCORD_INVITE } from '@/features/settings/discord'
import {
  type RatingRequest,
  ratingDisliked,
  ratingDismissed,
  ratingFeedbackOpened,
  ratingLiked,
  subscribeToRatingPrompt,
} from '@/lib/rating'
import { Button, Icon, Sheet, useToast } from '@/ui'

/**
 * The question the app asks before the store does.
 *
 * "Enjoying RiceCal?" with two answers, and only one of them reaches
 * `StoreReview.requestReview()`. The gate that decides WHEN this appears is in
 * `lib/rating`, and none of it is here: this component owns the two screens and
 * nothing about the cadence.
 *
 * MOUNTED AT THE ROOT, once, beside the other renderless syncs. It is a `Sheet`,
 * which is a native modal window, so it draws over whichever screen the trigger
 * fired on: a meal logged from the diary, a review read three pushes deep. A
 * copy per screen would be several sheets racing to answer one request.
 */

type Step = 'ask' | 'feedback'

export function RatePromptSheet() {
  const { t } = useTranslation(['profile', 'common'])
  const toast = useToast()
  const [request, setRequest] = useState<RatingRequest | null>(null)
  const [step, setStep] = useState<Step>('ask')

  useEffect(
    () =>
      subscribeToRatingPrompt((next) => {
        setStep('ask')
        setRequest(next)
      }),
    [],
  )

  // The request is kept until the sheet is closed AND answered, so the handlers
  // below can still name the trigger they belong to. Cleared on close, which is
  // what makes a second request a second sheet rather than a re-render of this
  // one holding the first one's trigger.
  const close = useCallback(() => setRequest(null), [])

  /**
   * CLOSE FIRST, then hand over. The store's own dialog is presented by the OS
   * over the key window, and this sheet is a native modal window in front of it;
   * `Sheet` takes its window down the moment `visible` turns false, so closing
   * on this line and reaching the store an await later is what keeps the two
   * from overlapping.
   */
  const liked = useCallback(() => {
    if (!request) return
    close()
    void ratingLiked(request)
  }, [request, close])

  /**
   * "Not really" does not close the sheet. It turns it into the second screen,
   * which is the offer of somewhere to say why. Closing and reopening would be
   * two sheets and, on iOS, a race with the window that is still dismissing.
   */
  const disliked = useCallback(() => {
    if (!request) return
    ratingDisliked(request)
    setStep('feedback')
  }, [request])

  const dismiss = useCallback(() => {
    if (!request) return
    close()
    ratingDismissed(request)
  }, [request, close])

  /**
   * Closes first, then opens Discord, for the reason `HelpSheet` gives: a toast
   * fired with the sheet still up renders underneath a native modal window and
   * is never seen. The failure path is the one that needs the toast, so the
   * order matters even though the happy path leaves the app entirely.
   */
  const openFeedback = useCallback(() => {
    if (!request) return
    close()
    ratingFeedbackOpened(request)
    Linking.openURL(DISCORD_INVITE).catch(() => {
      toast.show({ title: t('profile:help.failed'), tone: 'error' })
    })
  }, [request, close, toast, t])

  const asking = step === 'ask'

  return (
    <Sheet
      visible={request !== null}
      onClose={asking ? dismiss : close}
      closeLabel={t('common:action.close')}
      title={asking ? t('profile:rate.title') : t('profile:rate.feedbackTitle')}
      description={asking ? t('profile:rate.body') : t('profile:rate.feedbackBody')}
      /* BESIDE THE TITLE, which is what leaves the sheet with no body at all:
         a question, a line under it and two answers. Centred over its own
         picture the panel was three stacked blocks with a gap between each,
         and the gap was doing the work a heading should do.

         No plate under it either, unlike the Discord mark in `HelpSheet`.
         That one is a flat foreign vector and floats without an edge of its
         own; these two are the app's own illustrations, already raised and
         already carrying a shadow.

         `titleLeading` is documented for the chevron of a sheet that drills
         in, and this is the same slot put to its other use: the row is
         `items-center` with the title on `flex-1`, so the mark sits on the
         title's own line. The line under it still runs the panel's full
         width, which is what keeps this a heading rather than a list row. */
      titleLeading={
        <Icon
          set="system"
          name={asking ? 'star' : 'chat'}
          size={34}
          /**
           * An optical nudge, measured rather than guessed. `items-center`
           * centres the icon's box against the title's line box, and a Baloo 2
           * `subtitle` reserves most of its leading above the cap, so a 34pt
           * square lands 4pt below the line the caps draw. `ListRow` does not
           * need this, because its title is Nunito.
           *
           * The 2pt across is the icon's own margin: every file in
           * `assets/icons` carries about 5% of transparent canvas each side.
           *
           * A transform rather than margins, because this is a paint-time
           * correction: the row keeps its height and nothing else moves.
           */
          style={{ transform: [{ translateX: -2 }, { translateY: -4 }] }}
        />
      }
      /* TWO, because the mark has taken 34 points off the line the question
         has to fit on and the question is translated thirteen ways. Truncated,
         "RiceCal は気に入っていますか" is a sheet asking half a question; wrapped, it is
         a sheet one line taller. */
      titleLines={2}
      footer={
        asking ? (
          <View className="gap-1">
            <View className="flex-row gap-3">
              <Button variant="neutral" className="flex-1" onPress={disliked}>
                {t('profile:rate.no')}
              </Button>
              <Button className="flex-1" onPress={liked}>
                {t('profile:rate.yes')}
              </Button>
            </View>
            <Button variant="ghost" fullWidth onPress={dismiss}>
              {t('profile:rate.later')}
            </Button>
          </View>
        ) : (
          <View className="gap-1">
            <Button fullWidth onPress={openFeedback}>
              {t('profile:rate.feedbackOpen')}
            </Button>
            {/* Backing out of this screen is not a third answer. The
                `disliked` above has already been reported and the cooldown
                already stamped, so declining the conversation is counted as
                the absence of `Rating Feedback Opened`. See `events.ts`. */}
            <Button variant="ghost" fullWidth onPress={close}>
              {t('profile:rate.feedbackSkip')}
            </Button>
          </View>
        )
      }
    />
  )
}
