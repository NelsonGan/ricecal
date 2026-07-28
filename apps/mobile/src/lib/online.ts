import NetInfo from '@react-native-community/netinfo'
import { onlineManager } from '@tanstack/react-query'

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
