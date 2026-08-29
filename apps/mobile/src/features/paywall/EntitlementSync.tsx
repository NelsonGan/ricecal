import { useEntitlementSync } from '@/data'

/**
 * Renderless. Keeps what the store says and what our own mirror says in step, for
 * the whole app, from one place.
 *
 * A component rather than a call in the layout, for the reason `LoginLinkHandler`
 * beside it is one: the root layout is a stack of providers, and a hook called in
 * its body would sit above `SessionProvider`, which is what this needs to read.
 *
 * See `useEntitlementSync` for what it does and why a purchase would otherwise
 * take a webhook's worth of seconds to show up.
 */
export function EntitlementSync() {
  useEntitlementSync()
  return null
}
