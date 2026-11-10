import { IsRestoringProvider, useIsRestoring } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * Every query under this reads only while `shown` is true.
 *
 * A tab stays mounted once it has been visited, and a mounted query is one
 * react-query keeps current: it refetches when the app comes back to the front
 * and whenever a write invalidates it, whether or not anybody can see it. With
 * Trends visited once, every return to the app refetched its five reads behind
 * Today, and every meal and every glass of water refetched its charts.
 *
 * Hidden, the queries below draw what is cached and are not subscribed, so
 * neither of those reaches them: an invalidation only marks them stale. Shown
 * again, each subscribes and refetches if it went stale meanwhile, which is
 * the one moment the answer is wanted.
 *
 * This is the switch `PersistQueryClientProvider` holds while it restores the
 * cache from disk, and it is used here because it reaches every query in a
 * subtree, including the ones a later card adds. The per-query spelling is
 * `subscribed`, which every hook under the screen would have to be handed.
 *
 * Not for a query with a short `gcTime`: one nobody subscribes to is collected
 * on that clock, so the social reads, kept for a minute, would come back as a
 * skeleton. The Feed tab turns off its refetch on focus instead.
 */
export function ReadsWhileShown({ shown, children }: { shown: boolean; children: ReactNode }) {
  // Still restoring further up means not yet, whatever is on screen.
  const restoring = useIsRestoring()
  return <IsRestoringProvider value={restoring || !shown}>{children}</IsRestoringProvider>
}
