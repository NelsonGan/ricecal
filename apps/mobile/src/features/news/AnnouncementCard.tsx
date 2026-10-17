import { type Href, useRouter } from 'expo-router'
import { type ComponentType, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useProfile, useSeeAnnouncement } from '@/data'
import { track } from '@/lib/analytics'
import { reportError } from '@/lib/errors'
import { useThemeColors } from '@/theme/useTheme'
import { Button, cn, Icon, IconButton, Text, useHeld } from '@/ui'
import type {
  Announcement,
  AnnouncementCta,
  AnnouncementPage,
  AnnouncementSource,
} from './announcements'
import { FeedAutoSharePreview } from './FeedAutoSharePreview'
import { PhotoNotePreview } from './PhotoNotePreview'
import { WorkoutsPreview } from './WorkoutsPreview'

/**
 * Where each button goes and what it says. A route rather than a callback, so
 * the list and the launch card agree; the label is the destination's own name.
 */
const CTAS = {
  edit_profile: { route: '/settings/account', label: 'social:editProfile' },
  workouts: { route: '/workouts', label: 'common:nav.workouts' },
  personalisation: { route: '/settings/personalisation', label: 'profile:personalisation.title' },
} as const satisfies Record<AnnouncementCta, { route: Href; label: string }>

/** Each page's picture, drawn from the app's own components. */
const PICTURES = {
  workouts: WorkoutsPreview,
  feedAutoShare: FeedAutoSharePreview,
  photoNote: PhotoNotePreview,
} as const satisfies Record<AnnouncementPage['key'], ComponentType>

/**
 * Bodies that differ on iOS. The workouts page names the Apple Watch there and
 * only there: the watch app is iOS only, and an Android reader is not told
 * about something they cannot use.
 */
const IOS_BODIES = {
  workouts: 'news:workouts.bodyIos',
} as const satisfies Partial<Record<AnnouncementPage['key'], string>>

/** The card's inset from the screen's edges (`px-3`), for a first guess at the page width. */
const SIDE = 12

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
 * A release with several changes is one card of pages, swiped or stepped
 * through with Next, each with its own button under it and "Got it" on the
 * last. One card rather than several because only the newest is ever put up.
 *
 * Every way out is counted, with the page it happened on, since "did anyone
 * take the button" and "how far did they read" are the questions an
 * announcement exists to answer. The button's route is pushed once the
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
  const { t } = useTranslation(['news', 'common', 'social', 'profile'])
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  // Measured from the pager once it is laid out: a page a point off its
  // viewport drifts further off centre with every page it is swiped past.
  const [measuredWidth, setMeasuredWidth] = useState(0)
  const pageWidth = measuredWidth || width - SIDE * 2
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
  const pager = useRef<ScrollView>(null)
  // Where Next is scrolling to. Its animation passes through the page it left,
  // and following that would flick the dots back for a frame.
  const heading = useRef<number | null>(null)
  const [page, setPage] = useState(0)
  const [pictureHeight, setPictureHeight] = useState(0)
  // Each showing starts on its first page, set during the render that shows
  // it rather than after, so the second page never flashes up first. The
  // count remounts the pager, whose scroll offset would otherwise outlive it.
  const [showing, setShowing] = useState({ visible, count: 0 })
  if (showing.visible !== visible) {
    setShowing({ visible, count: showing.count + (visible ? 1 : 0) })
    if (visible) setPage(0)
  }

  const onShow = () => {
    if (!announcement) return
    answered.current = false
    heading.current = null
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

  const pages = shown.pages
  const current = pages[Math.min(page, pages.length - 1)]
  const last = page >= pages.length - 1

  const close = (via: 'done' | 'close') => {
    if (!announcement || answered.current) return
    answered.current = true
    track('Announcement Dismissed', { announcement: announcement.id, source, via, page: page + 1 })
    onClose()
  }

  const takeCta = () => {
    const cta = current.cta
    if (!announcement || !cta || answered.current) return
    answered.current = true
    track('Announcement CTA Tapped', { announcement: announcement.id, source, cta, page: page + 1 })
    queued.current = CTAS[cta].route
    onClose()
  }

  const next = () => {
    heading.current = page + 1
    pager.current?.scrollTo({ x: (page + 1) * pageWidth, animated: true })
    setPage(page + 1)
  }

  // The dots and buttons follow the page past halfway, not once the swipe
  // has settled. Only a change re-renders.
  const scrolled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const at = Math.round(event.nativeEvent.contentOffset.x / pageWidth)
    if (heading.current !== null) {
      if (at !== heading.current) return
      heading.current = null
    }
    if (at !== page) setPage(Math.max(0, Math.min(at, pages.length - 1)))
  }

  const body = (key: AnnouncementPage['key']) => {
    const ios = Platform.OS === 'ios' ? IOS_BODIES[key as keyof typeof IOS_BODIES] : undefined
    return ios ? t(ios) : t(`news:${key}.body`)
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
            <ScrollView
              key={showing.count}
              ref={pager}
              horizontal
              pagingEnabled
              bounces={false}
              showsHorizontalScrollIndicator={false}
              scrollEnabled={pages.length > 1}
              onScroll={scrolled}
              onScrollBeginDrag={() => {
                heading.current = null
              }}
              scrollEventThrottle={32}
              onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
            >
              {pages.map((item, index) => {
                const Picture = PICTURES[item.key]
                return (
                  <View
                    key={item.key}
                    style={{ width: pageWidth }}
                    // Only the page on screen, or VoiceOver reads all three.
                    accessibilityElementsHidden={index !== page}
                    importantForAccessibility={index === page ? 'auto' : 'no-hide-descendants'}
                  >
                    {/* Solid brand green rather than the pale tint: the
                        pictures sit on white cards, and on a panel of the pale
                        tint their edges disappeared into it. As tall as the
                        tallest picture on every page, so the words do not
                        jump on a swipe and no picture is cut to fit. */}
                    <View
                      className="justify-center bg-pandan px-5 pb-8 pt-11"
                      style={{ minHeight: pictureHeight }}
                      onLayout={(event) => {
                        const measured = event.nativeEvent.layout.height
                        setPictureHeight((tallest) => Math.max(tallest, measured))
                      }}
                    >
                      <Picture />
                    </View>
                    <View className="gap-2 px-5 pt-5">
                      <Text variant="title" accessibilityRole="header">
                        {t(`news:${item.key}.title`)}
                      </Text>
                      <Text variant="body" className="text-muted">
                        {body(item.key)}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </ScrollView>
            {pages.length > 1 ? (
              <View
                className="flex-row justify-center gap-1.5 pt-5"
                accessible
                accessibilityLabel={t('news:pageOf', { page: page + 1, count: pages.length })}
              >
                {pages.map((item, index) => (
                  <View
                    key={item.key}
                    className={cn(
                      'h-2 rounded-full',
                      index === page ? 'w-5 bg-pandan' : 'w-2 bg-line-strong',
                    )}
                  />
                ))}
              </View>
            ) : null}
            <View className="gap-1 px-5 pb-5 pt-5">
              <Button fullWidth onPress={last ? () => close('done') : next}>
                {last ? t('news:done') : t('news:next')}
              </Button>
              {current.cta ? (
                <Button fullWidth variant="ghost" onPress={takeCta}>
                  {t(CTAS[current.cta].label)}
                </Button>
              ) : null}
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
