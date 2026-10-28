import { useIsFocused, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useEntitlement, useProfile, useSession } from '@/data'
import { usePhotoRemovals } from '@/data/photoRemovals'
import { announcementHasTheFloor } from '@/features/news/useAnnouncementOffer'
import { tutorialOffered } from '@/features/tutorial'
import { useToast } from '@/ui'
import { markNoticed, noticeDue, summarize, whenLabel } from './notice'

/**
 * Long enough after Today appears that the milestone offer (1.4 s) has
 * either taken the screen or let it be. A toast over the paywall would point
 * at a list nobody can reach from there.
 */
const DELAY_MS = 3000

/**
 * Whether the tour had been offered before this run of the app, read once per
 * account per run. The tour marks itself offered as its toast appears, a
 * second before this one would, so a live read cannot tell the tour's launch
 * from any other. On that launch the notice waits: it would cover the tour.
 */
const tourBeforeThisRun = new Map<string, boolean>()
function tourAlreadyOffered(userId: string): boolean {
  let offered = tourBeforeThisRun.get(userId)
  if (offered === undefined) {
    offered = tutorialOffered(userId)
    tourBeforeThisRun.set(userId, offered)
  }
  return offered
}

/**
 * "14 meal photos will be removed by Friday", once a window, on Today, with
 * Show opening the list. The push says the same from the server
 * (`jobs/photo-warnings.ts`) for an account that does not open the app.
 *
 * Only while Today is on top when the beat arrives, and never on the launch
 * the tour or a news card is offered on; otherwise it waits for the next
 * launch rather than queueing behind whatever is up.
 */
export function usePhotoRemovalNotice(): void {
  const { t } = useTranslation('logging')
  const router = useRouter()
  const toast = useToast()
  const focused = useIsFocused()
  const { userId } = useSession()
  // Read on the first render, before the tour can mark itself.
  const tourDone = userId ? tourAlreadyOffered(userId) : false
  // Nor over a news card, which is drawn over Today rather than pushed, so
  // Today still reads as focused under it. The card is once per account; the
  // notice keeps until the next launch.
  const { data: profile } = useProfile()
  const announcing = !userId || profile === undefined || announcementHasTheFloor(userId, profile)
  // The rows outlive a purchase in the persisted cache, so the notice asks
  // the tier itself rather than trusting that a Pro account has no rows.
  const { entitled, loading, unknown } = useEntitlement()
  const free = !entitled && !loading && !unknown
  const { data } = usePhotoRemovals()
  const summary = data ? summarize(data) : null
  const count = summary?.count ?? 0
  const removesBy = summary?.removesBy.getTime() ?? 0
  const latest = useRef({ t, router, toast })
  latest.current = { t, router, toast }

  useEffect(() => {
    if (
      !userId ||
      !free ||
      !tourDone ||
      announcing ||
      !focused ||
      count === 0 ||
      !noticeDue(userId)
    )
      return
    const timer = setTimeout(() => {
      if (!noticeDue(userId)) return
      markNoticed(userId)
      const { t, router, toast } = latest.current
      toast.show({
        title: t('photoRemovals.toast', { count, when: whenLabel(t, new Date(removesBy)) }),
        tone: 'warning',
        placement: 'top',
        duration: 6000,
        action: { label: t('photoRemovals.show'), onPress: () => router.push('/settings/photos') },
      })
    }, DELAY_MS)
    return () => clearTimeout(timer)
  }, [userId, free, tourDone, announcing, focused, count, removesBy])
}
