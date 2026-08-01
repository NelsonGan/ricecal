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
      // Serve cache first, revalidate when a connection exists.
      networkMode: 'offlineFirst',
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
     * Everything except the signed photo URLs.
     *
     * Those are credentials with an expiry measured in the hour, and this
     * cache survives for a week — so writing them to disk stores a growing
     * pile of strings that are wrong by the time anything reads them. With
     * `offlineFirst` a rehydrated dead URL is even served before the refetch
     * that would replace it, which renders as a plate that failed to load.
     *
     * It costs nothing to leave them out: a signed URL is one request, and
     * the tile that wants it asks as it mounts. Cheap to redo, dangerous to
     * keep — the same test every persisted cache entry should pass.
     *
     * Composed with the library's own predicate rather than replacing it.
     * Supplying this option overrides the default outright, and the default is
     * what keeps a failed or half-finished query off the disk.
     */
    shouldDehydrateQuery: (query: Query) =>
      query.queryKey[0] !== 'photo' && defaultShouldDehydrateQuery(query),
  },
}
