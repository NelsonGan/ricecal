import { createJsonStore } from '@/lib/jsonStore'

/**
 * The group the Groups tab reopens on. Most people are in one group, so the tab
 * goes straight back to its board after a relaunch rather than the list, until
 * they tap back out. Kept per account, since one phone can be signed into two.
 */
const store = createJsonStore<string | null>('ricecal-groups', (stored) =>
  typeof stored === 'string' ? stored : null,
)

const key = (userId: string) => `open:${userId}`

export function useOpenGroup(userId: string): string | null {
  return store.useValue(key(userId), (value) => value)
}

export function setOpenGroup(userId: string, groupId: string | null): void {
  store.set(key(userId), groupId)
}
