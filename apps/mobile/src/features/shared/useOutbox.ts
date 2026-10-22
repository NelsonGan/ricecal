import { useCallback, useEffect, useRef, useState } from 'react'
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
 * Sends a message or a comment the way a messenger does: it is on screen the
 * moment it is sent, marked as sending, and the field is free for the next
 * one. A failure leaves it where it was, marked, to retry with the same request
 * id, so a send that did land is not posted twice.
 *
 * It stays drawn until the list the server returns holds its id. Removing it
 * when the request answered left a gap until the refetch drew the real row,
 * and a poll could land in between and drop it altogether.
 */
export function useOutbox(
  deliver: (item: Outgoing) => Promise<string | null | undefined>,
  serverIds: ReadonlySet<string>,
) {
  const [items, setItems] = useState<Outgoing[]>([])
  const latest = useRef(deliver)
  latest.current = deliver

  const run = useCallback(async (item: Outgoing) => {
    setItems((current) =>
      current.map((other) =>
        other.requestId === item.requestId ? { ...other, state: 'sending' } : other,
      ),
    )
    try {
      const id = (await latest.current(item)) ?? undefined
      setItems((current) =>
        current.map((other) => (other.requestId === item.requestId ? { ...other, id } : other)),
      )
    } catch {
      setItems((current) =>
        current.map((other) =>
          other.requestId === item.requestId ? { ...other, state: 'failed' } : other,
        ),
      )
    }
  }, [])

  const send = useCallback(
    (body: string) => {
      const item: Outgoing = {
        requestId: socialRequestId(),
        body,
        createdAt: new Date().toISOString(),
        state: 'sending',
      }
      setItems((current) => [...current, item])
      void run(item)
    },
    [run],
  )

  const retry = useCallback(
    (requestId: string) => {
      const item = items.find((other) => other.requestId === requestId)
      if (item && item.state === 'failed') void run(item)
    },
    [items, run],
  )

  // Confirmed rows go once the server's list shows them.
  useEffect(() => {
    setItems((current) => {
      const next = current.filter((item) => !(item.id && serverIds.has(item.id)))
      return next.length === current.length ? current : next
    })
  }, [serverIds])

  return { pending: items, send, retry }
}
