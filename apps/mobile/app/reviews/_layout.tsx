import { Redirect, Stack } from 'expo-router'

import { useSession } from '@/data'

/**
 * The reviews, behind a session.
 *
 * The same guard the Activity detail screens have, and it is here for the same
 * two reasons: every screen below reaches `useUserId`, which THROWS by design
 * when there is no session, so a deep link straight to `ricecal://reviews` or a
 * Fast Refresh mid-session would be a red error screen rather than a redirect.
 *
 * The list and one review share this group rather than sitting in `reviews/`
 * and `review/` the way the recipes do. The split there is a TAB and a page;
 * these are both pages, one of which is only ever reached from the other, and
 * two groups would mean two copies of this guard.
 */
export default function ReviewsLayout() {
  const { session, loading } = useSession()

  if (loading) return null
  if (!session) return <Redirect href="/sign-in" />

  return (
    /* Both push, and one of them used to present. A review was a
       `fullScreenModal` with the edge swipe turned off, for a reason that has
       gone: it paged sideways, and an interactive pop would have eaten the
       gesture that stepped it. It scrolls DOWN now, so it is an ordinary page
       you go to and come back from — a chevron, a swipe back, and the list
       still behind it. */
    <Stack screenOptions={{ headerShown: false }} />
  )
}
