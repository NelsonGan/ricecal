import { useIsFocused } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useProfile, useSession } from '@/data'
import { announcementHasTheFloor } from '@/features/news/useAnnouncementOffer'
import { track } from '@/lib/analytics'
import {
  answerLocationsOffer,
  requestLocationPermission,
  setLocationsEnabled,
  useLocationsOfferDue,
} from '@/lib/places'
import { ratingPromptBusy } from '@/lib/rating'
import { Button, Icon, Sheet, Text } from '@/ui'

/**
 * A beat after Today settles, so a meal's own sheet closing, the Pro nudge
 * (1.4 s) and the rating ask (1.2 s) have each taken the screen or let it be.
 */
const DELAY_MS = 2500

/**
 * "Remember where you eat?", once per phone and account, after a meal is
 * logged on this phone while Locations is off (README: Meal locations).
 *
 * Never stacked on another sheet: not while a news card has the floor this
 * launch, not while the rating ask is booked or up, and only while Today is
 * on top. A turn it cannot take is not lost; the offer stays due and the next
 * focus of Today asks again. It is stored as answered before it is on
 * screen, so a crash or a kill while it is up never brings it back.
 *
 * Turn on Locations closes the sheet, and only once it is gone asks for the
 * system permission: iOS will not present its alert over a modal on its way
 * down.
 */
export function LocationsOffer() {
  const { t } = useTranslation('places')
  const { userId } = useSession()
  const focused = useIsFocused()
  const due = useLocationsOfferDue(userId ?? '')
  const { data: profile } = useProfile()
  const announcing = !userId || profile === undefined || announcementHasTheFloor(userId, profile)
  const [visible, setVisible] = useState(false)
  const askAfterClose = useRef(false)

  useEffect(() => {
    if (!userId || !due || !focused || announcing || visible) return
    const timer = setTimeout(() => {
      if (ratingPromptBusy()) return
      answerLocationsOffer(userId)
      track('Locations Offer Shown', {})
      setVisible(true)
    }, DELAY_MS)
    return () => clearTimeout(timer)
  }, [userId, due, focused, announcing, visible])

  const accept = () => {
    if (!userId) return
    setLocationsEnabled(userId, true)
    track('Locations Toggled', { enabled: true, source: 'offer' })
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
        void requestLocationPermission()
      }}
      closeLabel={t('offerDecline')}
      footer={
        <View className="gap-sm">
          <Button fullWidth onPress={accept}>
            {t('offerAccept')}
          </Button>
          <Button fullWidth variant="ghost" onPress={() => setVisible(false)}>
            {t('offerDecline')}
          </Button>
        </View>
      }
    >
      <View className="items-center gap-sm pt-sm">
        <Icon set="ui" name="map" size={88} />
        <Text variant="title" className="text-center">
          {t('offerTitle')}
        </Text>
        <Text variant="body" className="text-center">
          {t('offerBody')}
        </Text>
      </View>
    </Sheet>
  )
}
