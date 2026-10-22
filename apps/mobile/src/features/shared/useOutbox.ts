import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { socialRequestId } from '@/features/social/request-id'

/** Something typed and sent, drawn in place before the server has it. */
export type Outgoing = {
  requestId: string
  body: string
  createdAt: string
  state: 'sending' | 'failed'
  /** The server's id once it answered, which is how the real row replaces this one. */
  id?: string
}

/**
 * Outboxes by thread, outside any component: a send still in flight when the
 * screen closes lands in the right place, and a failed one is still there,
 * marked, when the thread is opened again rather than lost with its text.
 * Memory only; a relaunch is a fresh start.
 */
const boxes = new Map<string, Outgoing[]>()
const listeners = new Set<() => void>()
/** Request ids being sent now, so a quick second tap on retry sends nothing. */
const inFlight = new Set<string>()
const NONE: Outgoing[] = []

function update(scope: string, change: (items: Outgoing[]) => Outgoing[]) {
  const current = boxes.get(scope) ?? NONE
  const next = change(current)
  if (next === current) return
  if (next.length) boxes.set(scope, next)
  else boxes.delete(scope)
  for (const listener of listeners) listener()
}

function patch(scope: string, requestId: string, fields: Partial<Outgoing>) {
  update(scope, (items) =>
    items.map((item) => (item.requestId === requestId ? { ...item, ...fields } : item)),
  )
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Sends a message or a comment the way a messenger does: it is on screen the
 * moment it is sent, marked as sending, and the field is free for the next
 * one. A failure leaves it where it was, marked, to retry with the same request
 * id, so a send that did land is not posted twice.
 *
 * It stays drawn until the list the server returns holds its id. Removing it
 * when the request answered left a gap until the refetch drew the real row,
 * and a poll could land in between and drop it altogether. The check is made
 * while drawing, so the two are never on screen together for a frame, and a
 * list that arrived before the request answered still replaces it.
 */
export function useOutbox(
  scope: string,
  deliver: (item: Outgoing) => Promise<string | null | undefined>,
  serverIds: ReadonlySet<string>,
) {
  const items = useSyncExternalStore(subscribe, () => boxes.get(scope) ?? NONE)
  const latest = useRef(deliver)
  latest.current = deliver

  const run = useCallback(
    async (item: Outgoing) => {
      if (inFlight.has(item.requestId)) return
      inFlight.add(item.requestId)
      patch(scope, item.requestId, { state: 'sending' })
      try {
        const id = (await latest.current(item)) ?? undefined
        patch(scope, item.requestId, { id })
      } catch {
        patch(scope, item.requestId, { state: 'failed' })
      } finally {
        inFlight.delete(item.requestId)
      }
    },
    [scope],
  )

  const send = useCallback(
    (body: string) => {
      const item: Outgoing = {
        requestId: socialRequestId(),
        body,
        createdAt: new Date().toISOString(),
        state: 'sending',
      }
      update(scope, (current) => [...current, item])
      void run(item)
    },
    [scope, run],
  )

  const retry = useCallback(
    (requestId: string) => {
      const item = boxes.get(scope)?.find((other) => other.requestId === requestId)
      if (item?.state === 'failed') void run(item)
    },
    [scope, run],
  )

  const pending = useMemo(
    () => items.filter((item) => !(item.id && serverIds.has(item.id))),
    [items, serverIds],
  )
  // And forgotten, once drawn by the server's list.
  useEffect(() => {
    if (pending.length === items.length) return
    update(scope, (current) => current.filter((item) => !(item.id && serverIds.has(item.id))))
  }, [scope, items, pending, serverIds])

  return { pending, send, retry }
}
