import { SCHEMA_VERSION } from '@ricecal/shared'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import {
  defaultShouldDehydrateQuery,
  focusManager,
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

export const persistOptions = {
  persister,
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  /**
   * Bumping SCHEMA_VERSION in @ricecal/shared discards every persisted query
   * rather than rehydrating an old shape into new code.
   */
  buster: SCHEMA_VERSION,
  dehydrateOptions: {
    /**
     * Everything except where the photos are. Neither answer under that key
     * survives a relaunch: a signed URL expires within the hour while this
     * cache lives a week, and a rehydrated dead URL is served before the
     * refetch that would replace it, so the plate renders as a failed load. The
     * other answer is a path into expo-image's cache, which a reinstall
     * renumbers.
     *
     * Leaving them out costs nothing, since `resolveStoredImage` asks the disk
     * before the network.
     *
     * Composed with the library's predicate rather than replacing it: supplying
     * this option overrides the default, and the default is what keeps a failed
     * query off the disk.
     */
    shouldDehydrateQuery: (query: Query) =>
      query.queryKey[0] !== 'photo' && defaultShouldDehydrateQuery(query),
  },
}
