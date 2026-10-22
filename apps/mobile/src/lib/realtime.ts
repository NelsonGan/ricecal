import type { RealtimeChannel } from '@supabase/supabase-js'
import { AppState } from 'react-native'
import { supabase } from './supabase'

/**
 * Private Realtime channels, at most one per topic however many screens ask
 * for it, and only while something is listening and the app is in front.
 *
 * Realtime is billed and capped by concurrent connections, and supabase-js
 * opens its one socket with the first channel and closes it with the last. So
 * a channel that outlives its screen, or a second one on the same topic, is a
 * connection held for nothing. Backgrounding closes every channel rather than
 * leaving iOS to kill the socket at some later point; coming back reopens
 * them, and a listener catches up when it hears `live` again.
 */
export type Listener = {
  onEvent: (event: string, payload: Record<string, unknown>) => void
  /** True once joined; false while joining, after an error, or in the background. */
  onLive: (live: boolean) => void
}

type Topic = {
  listeners: Set<Listener>
  channel: RealtimeChannel | null
  /** The previous channel's leave, which has to finish before the topic can be joined again. */
  closing: Promise<unknown> | null
  /** A rejoin after the server closed the channel, waiting out its delay. */
  retry: ReturnType<typeof setTimeout> | null
  /** Refused by the policy, so not tried again until everyone listening has left. */
  refused: boolean
  live: boolean
}

/** How long after the server closes a channel it is joined again. */
const REJOIN_MS = 3_000

const topics = new Map<string, Topic>()
let foreground = true
let watching = false

function setLive(entry: Topic, live: boolean) {
  if (entry.live === live) return
  entry.live = live
  for (const listener of entry.listeners) listener.onLive(live)
}

function open(topic: string, entry: Topic) {
  if (entry.channel || entry.closing || entry.retry || entry.refused) return
  if (!foreground || entry.listeners.size === 0) return
  const channel = supabase.channel(topic, { config: { private: true } })
  entry.channel = channel
  channel
    .on('broadcast', { event: '*' }, ({ event, payload }) => {
      for (const listener of entry.listeners) listener.onEvent(event, payload ?? {})
    })
    .subscribe((status, error) => {
      // A channel `close` let go of still reports its own closing.
      if (entry.channel !== channel) return
      if (status === 'CHANNEL_ERROR' && /unauthori[sz]ed/i.test(error?.message ?? '')) {
        // The realtime.messages policy said no: no longer a member. Phoenix
        // would retry the join for as long as the screen stays open, holding
        // the socket; the thread's own fetch already says what happened.
        entry.refused = true
        close(topic, entry)
        return
      }
      if (status === 'CLOSED') {
        // Closed from the server's side (an expired token, a restart), so it is
        // already gone from supabase-js and there is nothing to leave.
        entry.channel = null
        setLive(entry, false)
        entry.retry = setTimeout(() => {
          entry.retry = null
          open(topic, entry)
        }, REJOIN_MS)
        return
      }
      setLive(entry, status === 'SUBSCRIBED')
    })
}

function close(topic: string, entry: Topic) {
  if (entry.retry) {
    clearTimeout(entry.retry)
    entry.retry = null
  }
  const channel = entry.channel
  if (channel) {
    entry.channel = null
    setLive(entry, false)
    entry.closing = supabase
      .removeChannel(channel)
      .catch(() => 'error' as const)
      .then((answer) => {
        // A leave the server answered with an error leaves the channel listed:
        // supabase-js would hand it back for the next join of this topic, and
        // the socket would never count as empty.
        const stuck = answer === 'error' && supabase.realtime.channels.includes(channel)
        if (stuck) {
          channel.teardown()
          supabase.realtime.channels = supabase.realtime.channels.filter((c) => c !== channel)
        }
        entry.closing = null
        // Asked for again, or brought back to the front, while it was leaving.
        open(topic, entry)
        forget(topic, entry)
        // The library's own empty-socket timer never starts for a channel taken
        // out by hand, and in the background nothing would follow it anyway.
        if (stuck || !foreground) disconnectIfIdle()
      })
  }
  forget(topic, entry)
}

function disconnectIfIdle() {
  if (supabase.getChannels().length === 0) void supabase.realtime.disconnect()
}

function forget(topic: string, entry: Topic) {
  if (entry.listeners.size || entry.channel || entry.closing) return
  topics.delete(topic)
}

/**
 * One listener for the app's life, from the first chat opened. It outlives the
 * topics so a socket still lingering after the last chat closed (see
 * `lib/supabase.ts`) is shut when the app goes to the background too, rather
 * than being left for iOS to suspend.
 */
function watchAppState() {
  if (watching) return
  watching = true
  foreground = AppState.currentState !== 'background'
  AppState.addEventListener('change', (state) => {
    // `inactive` is the notification shade or the app switcher passing over,
    // not leaving; dropping the channel for it would cost a rejoin and a refetch.
    const next = state !== 'background'
    if (next === foreground) return
    foreground = next
    for (const [topic, entry] of topics) {
      if (next) open(topic, entry)
      else close(topic, entry)
    }
    if (!next) disconnectIfIdle()
  })
}

/** Listens on a private topic until the returned function is called. */
export function listen(topic: string, listener: Listener): () => void {
  watchAppState()
  let entry = topics.get(topic)
  if (!entry) {
    entry = {
      listeners: new Set(),
      channel: null,
      closing: null,
      retry: null,
      refused: false,
      live: false,
    }
    topics.set(topic, entry)
  }
  const current = entry
  current.listeners.add(listener)
  if (current.live) listener.onLive(true)
  open(topic, current)
  return () => {
    if (!current.listeners.delete(listener)) return
    if (current.listeners.size === 0) close(topic, current)
  }
}
