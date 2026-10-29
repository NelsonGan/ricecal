import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

/**
 * Long enough to fold a burst of writes (a sync, a plate of several foods)
 * into one request, short enough that the push still feels like it came with
 * the meal.
 */
const SETTLE_MS = 1_500
const GROUPS_STALE_MS = 5 * 60_000

let pending: ReturnType<typeof setTimeout> | null = null

/**
 * Asks the groups function to push the foods and workouts the viewer's own
 * writes just shared to their group chats. A trigger does the sharing, so the
 * app cannot tell which write shared something; it asks after any of them and
 * the server pushes whatever has not gone yet, once. Fire and forget, like the
 * other pushes: the shares are in the chats whether or not this lands.
 *
 * Someone in no group never calls the function. `myGroupsKey` is passed in
 * rather than imported because `keys.ts` calls this.
 */
export function pushGroupUpdates(queryClient: QueryClient, myGroupsKey: QueryKey): void {
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    void send(queryClient, myGroupsKey).catch(() => undefined)
  }, SETTLE_MS)
}

async function send(queryClient: QueryClient, myGroupsKey: QueryKey) {
  const groups = await queryClient.fetchQuery({
    queryKey: myGroupsKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_groups')
      if (error) throw error
      return data ?? []
    },
    staleTime: GROUPS_STALE_MS,
  })
  if (!Array.isArray(groups) || groups.length === 0) return
  await supabase.functions.invoke('groups', { body: { kind: 'updates' } })
}
