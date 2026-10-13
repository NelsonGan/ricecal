import NetInfo from '@react-native-community/netinfo'
import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

/**
 * Hand react-query NetInfo's view of connectivity instead of its default
 * browser `navigator.onLine`, which does not exist on native and leaves every
 * query believing it is permanently online.
 *
 * `isInternetReachable` is null until the first reachability probe resolves;
 * treat that as connected so a cold start is not misread as offline.
 */
export function initOnlineManager() {
  return onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false)
    }),
  )
}

const subscribe = (listener: () => void) => onlineManager.subscribe(listener)
const snapshot = () => onlineManager.isOnline()

/**
 * Whether the phone says it has a connection, kept current. For a screen that
 * has to tell "offline" apart from "online, and the request failed anyway":
 * the first fixes itself, the second needs a way to try again.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot)
}
