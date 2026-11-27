import { format } from 'date-fns/format'
import { useIsFocused } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, View } from 'react-native'

import { useProfile, useSession, useStoreEntitlement } from '@/data'
import {
  announcementHasTheFloor,
  tourOfferedBeforeThisRun,
} from '@/features/news/useAnnouncementOffer'
import { datePattern } from '@/lib/dates'
import { floorTaken, holdFloor } from '@/lib/floor'
import {
  ensureNotificationPermission,
  notificationPermissionState,
} from '@/lib/notificationPermission'
import { ratingAskBooked } from '@/lib/rating'
import { Button, Icon, Sheet, Text } from '@/ui'
import { reminderLeadDays, trialReminderAt, trialToRemind } from './trial'
import { markTrialReminderOffered, trialReminderOffered } from './trialReminderOffered'

/** After Today settles and the other launch questions have had their turn. */
const DELAY_MS = 2500

/**
 * "Want a reminder before you pay?", once per trial, to somebody on a free
 * trial the store will charge for whose notifications are off. The paywall's
 * timeline promised that reminder, and without the permission it cannot be
 * sent.
 *
 * The welcome screen after a purchase asks first. This catches everybody it
 * did not: a trial started on an older version, on another phone, before a
 * reinstall, or somebody who tapped past the ask. In app first rather than
 * straight to the system prompt, because iOS shows that prompt once and a
 * prompt with no reason in front of it is the one people refuse. After a
 * refusal the system will not ask again, so the button opens Settings.
 *
 * Stands aside like the Locations offer: not on the launch the tour is
 * offered on, not while a news card has the floor this launch, not while the rating ask is booked or another sheet is up, and
 * only while Today is on top. The reminder itself is booked by
 * `useTrialReminderSync`, which listens for the permission and for the app
 * coming back from Settings.
 */
export function TrialReminderOffer() {
  const { t } = useTranslation('paywall')
  const { userId } = useSession()
  const focused = useIsFocused()
  const { data: profile } = useProfile()
  const { data: store } = useStoreEntitlement()
  const announcing = !userId || profile === undefined || announcementHasTheFloor(userId, profile)
  // Not on the launch the tour's toast is offered on, as the news card is not:
  // a toast under a sheet is a toast nobody sees. It waits for the next launch.
  const tourDone = userId ? tourOfferedBeforeThisRun(userId) : false
  // What the sheet says, kept after it closes so the words do not change on
  // the way down, and so it is not put up twice in one run.
  const [offer, setOffer] = useState<{ endsAt: Date; lead: number; settings: boolean } | null>(null)
  const [visible, setVisible] = useState(false)
  const askAfterClose = useRef(false)

  const trial = trialToRemind(store)
  const end = trial?.end.getTime()
  const start = trial?.start?.getTime()

  useEffect(() => {
    if (!userId || end === undefined || !focused || announcing || !tourDone || offer) return
    const endsAt = new Date(end)
    const startedAt = new Date(start ?? 0)
    const remindAt = trialReminderAt(startedAt, endsAt)
    // Past the moment the reminder would fire, there is nothing left to offer.
    if (!remindAt || remindAt.getTime() <= Date.now()) return
    if (trialReminderOffered(userId, endsAt)) return

    let cancelled = false
    const timer = setTimeout(async () => {
      const permission = await notificationPermissionState()
      if (cancelled || permission.granted) return
      if (ratingAskBooked() || floorTaken('trial-reminder')) return
      holdFloor('trial-reminder', true)
      markTrialReminderOffered(userId, endsAt)
      setOffer({
        endsAt,
        lead: reminderLeadDays(startedAt, endsAt),
        settings: !permission.canAskAgain,
      })
      setVisible(true)
    }, DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [userId, end, start, focused, announcing, tourDone, offer])

  // Held while up, so the rating ask and the Locations offer let their turn pass.
  useEffect(() => {
    holdFloor('trial-reminder', visible)
    return () => holdFloor('trial-reminder', false)
  }, [visible])

  const accept = () => {
    askAfterClose.current = true
    setVisible(false)
  }

  return (
    <Sheet
      visible={visible}
      onClose={() => setVisible(false)}
      onDismiss={() => {
        if (!askAfterClose.current) return
        askAfterClose.current = false
        // iOS will not present its alert over a sheet on its way down, so the
        // ask waits until the sheet has gone.
        if (offer?.settings) void Linking.openSettings()
        else void ensureNotificationPermission()
      }}
      closeLabel={t('reminderOffer.decline')}
      footer={
        <View className="gap-sm">
          <Button fullWidth onPress={accept}>
            {offer?.settings ? t('reminderOffer.openSettings') : t('reminderOffer.accept')}
          </Button>
          <Button fullWidth variant="ghost" onPress={() => setVisible(false)}>
            {t('reminderOffer.decline')}
          </Button>
        </View>
      }
    >
      <View className="items-center gap-sm pt-sm">
        <Icon set="system" name="bell" size={88} />
        {/* Push-out keeps one word from standing alone on the second line. */}
        <Text variant="title" className="text-center" lineBreakStrategyIOS="push-out">
          {t('reminderOffer.title')}
        </Text>
        {offer ? (
          <Text variant="body" className="text-center">
            {t('reminderOffer.body', {
              date: format(offer.endsAt, datePattern('weekdayDayMonth')),
              count: offer.lead,
            })}
          </Text>
        ) : null}
      </View>
    </Sheet>
  )
}
