import { createMMKV } from 'react-native-mmkv'

export type LogPanel = 'camera' | 'describe' | 'search'

// Read synchronously so the modal opens on the right option, including offline.
// Each account keeps its own choice when a phone is shared.
const storage = createMMKV({ id: 'ricecal-logging' })
const key = (userId: string) => `panel:${userId}`

export function storedLogPanel(userId: string): LogPanel {
  const value = storage.getString(key(userId))
  return value === 'camera' || value === 'describe' || value === 'search' ? value : 'camera'
}

export function storeLogPanel(userId: string, panel: LogPanel): void {
  storage.set(key(userId), panel)
}
