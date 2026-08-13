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
       * PAUSE WHEN THERE IS NO CONNECTION. DO NOT ASK ANYWAY.
       *
       * This was `offlineFirst`, which sounds like the offline-tolerant choice
       * and is the opposite: it fires the FIRST request whatever the connection
       * and pauses only the retries after it. Every offline branch in this app
       * keys on a query being PAUSED — the router, Today, the search panel — and
       * none of them could fire until that doomed first request had failed.
       *
       * Which took thirty seconds, because of what a request waits on. Supabase
       * reads the access token before it sends anything, and a token within 90
       * seconds of expiring is refreshed first — so a launch an hour after the
       * last one, offline, queues every query in the app behind a backoff loop
       * that gives up after `AUTO_REFRESH_TICK_DURATION_MS`. Measured on a cold
       * launch with no connection: 30 seconds of spinner, then the offline
       * screen the app could have drawn immediately.
       *
       * It also QUIETLY ATE THE DIARY. A query that fails ends `error`, and only
       * a `success` is written to disk — so an offline launch persisted a
       * snapshot with the failed queries missing, and the next offline launch
       * had less to draw from than the one before. The profile went first: it is
       * the one query whose screen redirects away while it is still in flight,
       * and losing its last observer cancels the retry that would have paused,
       * settling it as an error over perfectly good data. Offline worked once.
       *
       * Paused, none of that happens: nothing is sent, nothing fails, the cache
       * stays `success` and goes on being written, and react-query resumes by
       * itself the moment a connection returns. Cached data is served either
       * way — the mode gates the REQUEST, never the read.
       *
       * The cost is trusting `onlineManager`: a NetInfo that wrongly reports
       * offline pauses reads until it corrects itself. Mutations below have
       * always trusted exactly that, so this is one signal for the whole app
       * rather than a new dependency.
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
     * Everything except where the photos are.
     *
     * Two kinds of answer live under that key and neither survives a relaunch
     * intact. A signed URL is a credential with an expiry measured in the
     * hour, and this cache survives for a week, so writing one to disk stores
     * a string that is wrong by the time anything reads it — a rehydrated dead
     * URL is even served before the refetch that would replace it, which
     * renders as a plate that failed to load. A path into expo-image's own
     * cache is the other, and it belongs to an app container that a reinstall
     * renumbers and an eviction can empty.
     *
     * It costs nothing to leave them out. `resolveStoredImage` asks the disk
     * before it asks the network, so the tile that wants one usually gets it
     * back without a request at all. Cheap to redo, dangerous to keep — the
     * same test every persisted cache entry should pass.
     *
     * Composed with the library's own predicate rather than replacing it.
     * Supplying this option overrides the default outright, and the default is
     * what keeps a failed or half-finished query off the disk.
     */
    shouldDehydrateQuery: (query: Query) =>
      query.queryKey[0] !== 'photo' && defaultShouldDehydrateQuery(query),
  },
}
