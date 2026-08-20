import { useEntitlementSync } from '@/data'

/**
 * Renderless. Keeps what the STORE says and what our own mirror says in step,
 * for the whole app, from one place.
 *
 * A COMPONENT RATHER THAN A CALL IN THE LAYOUT, for the reason
 * `LoginLinkHandler` beside it is one: the root layout is a stack of providers
 * and a hook called in its body would sit ABOVE `SessionProvider`, which is
 * exactly the thing this needs to read. Mounted as a child it is inside every
 * provider it depends on, and it draws nothing.
 *
 * See `useEntitlementSync` for what it actually does and why a purchase would
 * otherwise take a webhook's worth of seconds to show up.
 */
export function EntitlementSync() {
  useEntitlementSync()
  return null
}
