import { SCHEMA_VERSION } from '@ricecal/shared'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import {
  defaultShouldDehydrateQuery,
  focusManager,
  onlineManager,
  type Query,
  QueryClient,
} from '@tanstack/react-query'
import { AppState } from 'react-native'
import { createMMKV } from 'react-native-mmkv'

/**
 * "Focused" on a phone means the app is in front.
 *
 * React Query's own definition is a browser one — `window.focus` — which never
 * fires here, so refetch-on-focus quietly did nothing and coming back to the
 * app showed whatever was cached when it was last open. A scan that finished
 * while the phone was in a pocket landed in the database and not on Today.
 */
AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'))

const storage = createMMKV({ id: 'ricecal-query-cache' })

/**
 * react-native-mmkv v4 dropped `new MMKV()` for `createMMKV()`, and renamed
 * `delete` to `remove`. The shape below is what createSyncStoragePersister
 * wants — synchronous, string-valued, three methods.
 */
const mmkvStorage = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => {
    storage.remove(key)
  },
}

export const persister = createSyncStoragePersister({
  storage: mmkvStorage,
  key: 'ricecal-query-cache',
})

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * This single line is what makes offline reads work. The 5-minute default
       * garbage-collects a query before the persister ever writes it to disk,
       * so the cache looks empty on next launch and the bug looks like MMKV.
       */
      gcTime: Number.POSITIVE_INFINITY,
      /**
       * Pause when there is no connection rather than asking anyway.
       *
       * `offlineFirst` sounds like the offline-tolerant choice and is the
       * opposite: it fires the first request whatever the connection and pauses
       * only the retries. Every offline branch in this app keys on a query being
       * paused, so none of them ran until that doomed request had failed, which
       * took thirty seconds of spinner: Supabase refreshes a nearly-expired
       * token before sending anything, so every query queued behind a backoff
       * loop that gives up after `AUTO_REFRESH_TICK_DURATION_MS`.
       *
       * It also ate the diary. Only a `success` is written to disk, so an
       * offline launch persisted a snapshot with the failed queries missing and
       * the next offline launch had less to draw from. The profile went first,
       * being the one query whose screen redirects away mid-flight.
       *
       * Paused, nothing is sent, the cache stays `success`, and react-query
       * resumes when a connection returns. The mode gates the request, never the
       * read, so cached data is served either way.
       *
       * The cost is trusting `onlineManager`. Mutations already do.
       */
      networkMode: 'online',
      staleTime: 30_000,
      retry: 2,
    },
    mutations: {
      /**
       * Writes are online-only by v1 decision. The log action disables itself
       * with a stated reason when offline — it does not queue and it does not
       * fail silently.
       */
      networkMode: 'online',
    },
  },
})

/** How long anything written to disk is kept: the snapshot, and each query in it. */
const PERSIST_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

/**
 * What goes to disk. Everything, except:
 *
 * - Where the photos are. Neither answer under that key survives a relaunch: a
 *   signed URL expires within the hour while this cache lives a week, and a
 *   rehydrated dead URL is served before the refetch that would replace it, so
 *   the plate renders as a failed load. The other answer is a path into
 *   expo-image's cache, which a reinstall renumbers. Leaving them out costs
 *   nothing, since `resolveStoredImage` asks the disk before the network.
 * - Social visibility, which can be revoked between launches.
 * - Other people's meals and messages in a group, which leaving it or a block
 *   takes away. The list of groups and the invite count are the viewer's own,
 *   and are what the tab draws first.
 * - What was typed into a search box. Each pause in typing is its own query,
 *   so "nasi lemak" is ten of them and fifty dishes each: six searches wrote
 *   1.2 MB here, none of it ever asked for again, and nothing took it back out.
 * - Anything fetched more than a week before the newest answer here. `gcTime`
 *   is infinite so the persister can write a query at all, which means nothing
 *   in memory expires, and `maxAge` only discards the whole snapshot when the
 *   app has not been opened for a week. For somebody who opens it daily that
 *   was never, so every day ever looked at and every food ever opened was
 *   written back at each launch. A query a screen still uses is refetched long
 *   before it falls a week behind; one that is not stops being saved. Measured
 *   from the newest answer rather than from now, so a phone with no connection
 *   for a fortnight still opens on the diary it last had. Only what the
 *   server answered counts as newest: nothing written while offline does.
 *
 * The whole snapshot is serialised again each time any query changes, at most
 * once a second, and parsed before the first query runs at launch, so its size
 * is paid on the JS thread at both ends.
 *
 * Composed with the library's predicate rather than replacing it: supplying
 * this option overrides the default, and the default is what keeps a failed
 * query off the disk.
 */
export function shouldPersistQuery(query: Query): boolean {
  // Only an answer from the server says how old the rest are. The store's
  // entitlement and the photos are answered with no connection, and a tap
  // patches its query before the paused write goes anywhere; counting any of
  // them made a phone a week offline drop the diary it was meant to keep.
  if ((query.options.networkMode ?? 'online') === 'online' && onlineManager.isOnline()) {
    newestAnswer = Math.max(newestAnswer, query.state.dataUpdatedAt)
  }
  const [area, , third, fourth] = query.queryKey
  if (area === 'social' || area === 'photo' || area === 'food-search') return false
  if (area === 'groups' && third !== 'my_groups' && third !== 'group_invite_count') return false
  // A recipe shelf with something in its search field. The shelves themselves
  // have an empty one, and the count has none.
  if (area === 'recipes' && typeof fourth === 'string' && fourth !== '') return false
  // Never later than now: an answer stamped while the phone's clock was set
  // ahead would otherwise age out everything fetched since it was put back.
  const newest = Math.min(newestAnswer, Date.now())
  if (newest - query.state.dataUpdatedAt > PERSIST_MAX_AGE_MS) return false
  return defaultShouldDehydrateQuery(query)
}

/**
 * When the newest answer `shouldPersistQuery` has seen arrived. A running
 * maximum rather than a scan per call: every query passes through on each
 * save, so it is exact from the second one.
 */
let newestAnswer = 0

export const persistOptions = {
  persister,
  maxAge: PERSIST_MAX_AGE_MS,
  /**
   * Bumping SCHEMA_VERSION in @ricecal/shared discards every persisted query
   * rather than rehydrating an old shape into new code.
   */
  buster: SCHEMA_VERSION,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) => shouldPersistQuery(query),
  },
}
