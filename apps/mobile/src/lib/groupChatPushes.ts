/**
 * Chat pushes that reach the app while it is open, by group. The notification
 * handler announces them and the board listens, so the board's count can catch
 * up without a Realtime channel. Plain JavaScript on purpose: the data layer
 * imports this, and importing `expo-notifications` there would pull the native
 * module into everything that reads a group.
 */
type Listener = (groupId: string) => void

const listeners = new Set<Listener>()

export function announceGroupChatPush(groupId: string): void {
  for (const listener of listeners) listener(groupId)
}

export function onGroupChatPush(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
