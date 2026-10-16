import { type Href, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useProfile, useSeeAnnouncement } from '@/data'
import { track } from '@/lib/analytics'
import { reportError } from '@/lib/errors'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, IconButton, Text, useHeld } from '@/ui'
import type { Announcement, AnnouncementCta, AnnouncementSource } from './announcements'
import { FeedAutoSharePreview } from './FeedAutoSharePreview'

/**
 * Where each button goes and what it says. A route rather than a callback, so
 * the list and the launch card agree; the label is the destination's own name.
 */
const CTAS = {
  edit_profile: { route: '/settings/account', label: 'social:editProfile' },
} as const satisfies Record<AnnouncementCta, { route: Href; label: string }>

/**
 * One announcement: its picture on a tinted panel, then the words and the way
 * on. A card floating over the screen rather than a page, because it is news
 * about the app, read in passing on the way to something else.
 *
 * Seen is recorded from `onShow`, the native confirmation that the card is on
 * screen, never from the prop: iOS refuses to present over another modal and
 * says nothing, and a card marked seen there would have switched a setting on
 * behind a card nobody read. The first showing claims, from the launch or the
 * list; later ones find it seen and change nothing.
 *
 * Every way out is counted, since "did anyone take the button" is the question
 * an announcement exists to answer. The button's route is pushed once the
 * modal has gone, as `Dialog` does it: presenting a screen while this native
 * modal is still leaving is how iOS ends up presenting nothing.
 */
export function AnnouncementCard({
  announcement,
  source,
  onClose,
}: {
  /** Null hides the card. */
  announcement: Announcement | null
  source: AnnouncementSource
  onClose: () => void
}) {
  const { t } = useTranslation(['news', 'common', 'social'])
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const colors = useThemeColors()
  const { data: profile } = useProfile()
  const see = useSeeAnnouncement()
  const visible = announcement !== null
  // Kept while it fades, so the copy does not blank mid-animation.
  const shown = useHeld(announcement, visible)
  const queued = useRef<Href | null>(null)
  // One answer per showing. A double tap, or the scrim tapped after the
  // button, lands before the parent has hidden the card and would count twice.
  const answered = useRef(false)

  const onShow = () => {
    if (!announcement) return
    answered.current = false
    track('Announcement Shown', { announcement: announcement.id, source })
    if (profile?.seen_announcements?.includes(announcement.id)) return
    see.mutate(
      { id: announcement.id, enables: announcement.enables },
      // Unclaimed, so the card comes back on a later launch and tries again.
      {
        onError: (error) => reportError(error, { scope: 'announcement_seen', id: announcement.id }),
      },
    )
  }

  const runQueued = () => {
    const route = queued.current
    queued.current = null
    if (route) router.push(route)
  }

  // Android has no `onDismiss`; its modal is gone once `visible` is false.
  useEffect(() => {
    if (!visible && Platform.OS !== 'ios') runQueued()
  })

  if (!shown) return null

  const close = (via: 'done' | 'close') => {
    if (!announcement || answered.current) return
    answered.current = true
    track('Announcement Dismissed', { announcement: announcement.id, source, via })
    onClose()
  }

  const takeCta = () => {
    const cta = announcement?.cta
    if (!announcement || !cta || answered.current) return
    answered.current = true
    track('Announcement CTA Tapped', { announcement: announcement.id, source, cta })
    queued.current = CTAS[cta].route
    onClose()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => close('close')}
      onShow={onShow}
      onDismiss={runQueued}
      testID="announcement-card"
    >
      <View
        className="flex-1 justify-end px-3"
        style={{ paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <Pressable
          className="absolute inset-0 bg-black/45"
          onPress={() => close('close')}
          accessibilityRole="button"
          accessibilityLabel={t('common:a11y.close')}
        />
        <View
          className="overflow-hidden rounded-card bg-surface"
          style={{ maxHeight: height - insets.top - Math.max(insets.bottom, 12) - 12 }}
          accessibilityViewIsModal
        >
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {/* Solid brand green rather than the pale tint: the post's own
                drawing sits on that tint, and on a panel of the same colour the
                card's edges disappeared into it. */}
            <View className="bg-pandan px-5 pb-8 pt-11">
              {shown.key === 'feedAutoShare' ? <FeedAutoSharePreview /> : null}
            </View>
            <View className="gap-2 px-5 pt-5">
              <Text variant="title" accessibilityRole="header">
                {t(`news:${shown.key}.title`)}
              </Text>
              <Text variant="body" className="text-muted">
                {t(`news:${shown.key}.body`)}
              </Text>
            </View>
            <View className="gap-1 px-5 pb-5 pt-5">
              {shown.cta ? (
                <Button fullWidth onPress={takeCta}>
                  {t(CTAS[shown.cta].label)}
                </Button>
              ) : null}
              <Button
                fullWidth
                variant={shown.cta ? 'ghost' : 'primary'}
                onPress={() => close('done')}
              >
                {t('news:done')}
              </Button>
            </View>
          </ScrollView>
          <View className="absolute right-3 top-3">
            <IconButton
              size="sm"
              variant="neutral"
              accessibilityLabel={t('common:a11y.close')}
              onPress={() => close('close')}
            >
              <Icon set="ui" name="close" size={18} tintColor={colors.muted} />
            </IconButton>
          </View>
        </View>
      </View>
    </Modal>
  )
}
