import { createJsonStore } from '@/lib/jsonStore'

/**
 * The group Social shows. Most people are in one group, so it comes back to
 * the same card after a relaunch, until another is chosen. Kept per account,
 * since one phone can be signed into two.
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

/**
 * Whether the Groups page is the screen on top, so an invite tapped while it
 * is open shows the invites there rather than pushing a second page.
 */
let groupsPageOnTop = false
export function setGroupsPageOnTop(onTop: boolean): void {
  groupsPageOnTop = onTop
}
export function isGroupsPageOnTop(): boolean {
  return groupsPageOnTop
}

/** The day a notification asked for, once; later reads get nothing. */
export function takeOpenDay(userId: string, groupId: string): string | undefined {
  const open = store.get(key(userId))
  if (open?.groupId !== groupId || !open.day) return undefined
  store.set(key(userId), { groupId })
  return open.day
}
