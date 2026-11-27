import * as Notifications from 'expo-notifications'

/**
 * Asks, once, and reports what the user said.
 *
 * Never called on launch. A notification the user never asked for on the day
 * they sign up is how an app gets its permission revoked — which is also why
 * every `reminder_enabled` starts false in the signup trigger. The ask happens
 * when they turn their first reminder on.
 */
const grantedListeners = new Set<() => void>()

/**
 * Calls back when an ask in this run ends in a yes, so whatever books from the
 * permission (the trial reminder) can do it then rather than at the next
 * foreground, which may come before the OS has recorded the answer.
 */
export function onNotificationPermissionGranted(listener: () => void): () => void {
  grantedListeners.add(listener)
  return () => {
    grantedListeners.delete(listener)
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const granted = await askNotificationPermission()
  if (granted) for (const listener of grantedListeners) listener()
  return granted
}

async function askNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync()
  if (existing.granted) return true

  // `canAskAgain` false means they said no already. Asking again is a no-op
  // that returns denied, so the caller needs to send them to Settings instead.
  if (!existing.canAskAgain) return false

  try {
    const request = await Notifications.requestPermissionsAsync()
    return request.granted
  } catch (error) {
    /**
     * The request can reject AFTER the user has already tapped Allow.
     *
     * expo-notifications stores its server registration in the keychain once
     * permission is granted, and on a build with no entitlements that write
     * throws — so the OS has the permission and the SDK reports failure.
     * Asking the OS directly is what tells those two cases apart; without it
     * the switch the user just turned on quietly turns itself back off.
     */
    const granted = await notificationsAllowed()
    if (!granted) throw error
    console.warn('[notifications] permission granted, but the SDK could not record it', error)
    return true
  }
}

export async function notificationsAllowed(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted
  } catch {
    return false
  }
}
