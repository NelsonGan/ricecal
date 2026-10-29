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
  /** Only a focused chat publishes presence; boards just listen for messages. */
  presence?: { userId: string; onCount: (count: number | null) => void }
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
  online: number | null
  trackedUser: string | null
  presenceUpdate: Promise<void>
  connection: number
}

/** How long after the server closes a channel it is joined again. */
const REJOIN_MS = 3_000

const topics = new Map<string, Topic>()
let foreground = true
let watching = false

function setOnline(entry: Topic, count: number | null) {
  if (entry.online === count) return
  entry.online = count
  for (const listener of entry.listeners) listener.presence?.onCount(count)
}

/** Serialize leaving and returning while the board keeps the shared channel. */
function updatePresence(entry: Topic) {
  const channel = entry.channel
  const connection = entry.connection
  entry.presenceUpdate = entry.presenceUpdate
    .then(async () => {
      if (!channel || entry.channel !== channel || !entry.live || entry.connection !== connection)
        return
      const userId = [...entry.listeners].find((listener) => listener.presence)?.presence?.userId
      if ((userId ?? null) === entry.trackedUser) return
      const result = userId ? await channel.track({ user_id: userId }) : await channel.untrack()
      if (entry.channel !== channel || entry.connection !== connection) return
      if (result === 'ok') entry.trackedUser = userId ?? null
      else setOnline(entry, null)
    })
    .catch(() => {
      if (entry.channel === channel && entry.connection === connection) setOnline(entry, null)
    })
}

function setLive(entry: Topic, live: boolean) {
  if (entry.live === live) return
  entry.live = live
  if (!live) {
    entry.trackedUser = null
    entry.connection += 1
    setOnline(entry, null)
  }
  for (const listener of entry.listeners) listener.onLive(live)
}

function open(topic: string, entry: Topic) {
  if (entry.channel || entry.closing || entry.retry || entry.refused) return
  if (!foreground || entry.listeners.size === 0) return
  // A leave the server answered with an error leaves its channel listed, and
  // supabase-js would hand that same channel back, bindings and all. Polling
  // covers this chat instead.
  if (supabase.getChannels().some((channel) => channel.topic === `realtime:${topic}`)) return
  const channel = supabase.channel(topic, { config: { private: true } })
  entry.channel = channel
  channel
    .on('broadcast', { event: '*' }, ({ event, payload }) => {
      for (const listener of entry.listeners) listener.onEvent(event, payload ?? {})
    })
    .on('presence', { event: 'sync' }, () => {
      if (entry.channel !== channel || !entry.live) return
      // One person on two devices is still one person. Never store this in the query cache.
      const users = new Set(
        Object.values(channel.presenceState<{ user_id?: unknown }>())
          .flat()
          .map((presence) => presence.user_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      )
      setOnline(entry, users.size)
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
      if (status === 'SUBSCRIBED') updatePresence(entry)
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
      .catch(() => undefined)
      .finally(() => {
        entry.closing = null
        // Asked for again, or brought back to the front, while it was leaving.
        open(topic, entry)
        forget(topic, entry)
        sleepInBackground()
      })
  }
  forget(topic, entry)
}

/**
 * Closes the socket once the app is in the background and every leave has
 * finished. supabase-js would keep an empty one for a few seconds and one
 * still holding a channel whose leave failed for good; in the background
 * nothing should hold it, and iOS would only suspend the app with it open.
 */
function sleepInBackground() {
  if (foreground) return
  for (const entry of topics.values()) if (entry.channel || entry.closing) return
  void supabase.realtime.disconnect()
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
    sleepInBackground()
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
      online: null,
      trackedUser: null,
      presenceUpdate: Promise.resolve(),
      connection: 0,
    }
    topics.set(topic, entry)
  }
  const current = entry
  current.listeners.add(listener)
  if (current.live) listener.onLive(true)
  listener.presence?.onCount(current.online)
  if (current.live) updatePresence(current)
  open(topic, current)
  return () => {
    if (!current.listeners.delete(listener)) return
    if (current.listeners.size === 0) close(topic, current)
    else updatePresence(current)
  }
}
