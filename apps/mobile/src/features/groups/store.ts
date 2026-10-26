import { createJsonStore } from '@/lib/jsonStore'

/**
 * Where the Groups tab opens. Most people are in one group, so the tab goes
 * straight back to its board after a relaunch rather than the list, until they
 * tap back out. Kept per account, since one phone can be signed into two.
 *
 * `day` is set only by a notification tap, for the board to open on the day
 * the nudge was about, and is consumed by the board once read.
 */
type Open = { groupId: string; day?: string } | null

const store = createJsonStore<Open>('ricecal-groups', (stored) => {
  if (typeof stored === 'string') return { groupId: stored }
  const value = stored as { groupId?: unknown; day?: unknown } | null
  return typeof value?.groupId === 'string'
    ? { groupId: value.groupId, day: typeof value.day === 'string' ? value.day : undefined }
    : null
})

const key = (userId: string) => `open:${userId}`

export function useOpenGroup(userId: string): string | null {
  return store.useValue(key(userId), (value) => value?.groupId ?? null)
}

/** A notification's day still waiting for the board to take it. */
export function useOpenDay(userId: string): string | null {
  return store.useValue(key(userId), (value) => value?.day ?? null)
}

export function setOpenGroup(userId: string, groupId: string | null, day?: string): void {
  store.set(key(userId), groupId ? { groupId, day } : null)
}

/** The day a notification asked for, once; later reads get nothing. */
export function takeOpenDay(userId: string, groupId: string): string | undefined {
  const open = store.get(key(userId))
  if (open?.groupId !== groupId || !open.day) return undefined
  store.set(key(userId), { groupId })
  return open.day
}
