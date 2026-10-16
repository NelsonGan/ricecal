import { requireOptionalNativeModule } from 'expo'

import type {
  WatchCommand,
  WatchHeartTrace,
  WatchInboxItem,
  WatchPulse,
  WatchState,
  WatchStatus,
} from './src/types'

export type * from './src/types'

/**
 * The seam between the app and its Apple Watch app, over WatchConnectivity.
 *
 * Optional twice over, for the reason the widgets' seam is: a dev client built
 * before this module landed, an over-the-air update that reaches an older
 * binary, and Android, where there is no watch app, all find it absent or
 * incomplete, and every call is then a no-op.
 */
type Native = {
  publish?(json: string): void
  takeInbox?(): string
  status?(): WatchStatus
  startWatchWorkoutAsync?(): Promise<boolean>
  addListener?(
    event: 'onInbox' | 'onPulse' | 'onStatus',
    listener: (payload: Record<string, unknown>) => void,
  ): { remove(): void }
}

const native = requireOptionalNativeModule<Native>('RiceCalWatch')

const NO_WATCH: WatchStatus = { paired: false, installed: false, reachable: false }

/** Whether a watch is paired, has the app, and can be reached right now. */
export function watchStatus(): WatchStatus {
  try {
    return native?.status?.() ?? NO_WATCH
  } catch {
    return NO_WATCH
  }
}

/**
 * Hand the watch what it should draw. The native side keeps the latest one,
 * sends it as the application context (which reaches the watch app whenever it
 * next runs) and, if the watch is reachable, as a message too, which arrives
 * at once.
 */
export function publishWatchState(state: WatchState): void {
  native?.publish?.(JSON.stringify(state))
}

/**
 * What the watch sent since the last call, and the inbox emptied: the newest
 * list of commands it has not seen confirmed, and any traces. The native side keeps it in the app's defaults until it is taken,
 * so a command that woke the app before JS ran is not lost. Anything
 * unreadable is dropped rather than thrown on: the inbox can outlive the build
 * that wrote it.
 */
export function takeWatchInbox(): WatchInboxItem[] {
  const raw = native?.takeInbox?.()
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.flatMap(readItem) : []
  } catch {
    return []
  }
}

function readItem(value: unknown): WatchInboxItem[] {
  if (typeof value !== 'object' || value === null) return []
  const item = value as Record<string, unknown>
  if (item.kind === 'commands' && Array.isArray(item.commands)) {
    return [{ kind: 'commands', commands: item.commands.filter(isCommand) }]
  }
  if (item.kind === 'heart' && isTrace(item.trace)) return [{ kind: 'heart', trace: item.trace }]
  return []
}

const COMMANDS = new Set<WatchCommand['type']>([
  'start',
  'complete',
  'uncomplete',
  'addSet',
  'restAdjust',
  'restSkip',
  'recording',
  'finish',
  'discard',
])

function isCommand(value: unknown): value is WatchCommand {
  if (typeof value !== 'object' || value === null) return false
  const command = value as Record<string, unknown>
  return (
    typeof command.seq === 'number' &&
    typeof command.workoutId === 'string' &&
    typeof command.at === 'number' &&
    COMMANDS.has(command.type as WatchCommand['type'])
  )
}

function isTrace(value: unknown): value is WatchHeartTrace {
  if (typeof value !== 'object' || value === null) return false
  const trace = value as Record<string, unknown>
  return (
    typeof trace.workoutId === 'string' &&
    typeof trace.startedAt === 'number' &&
    typeof trace.intervalS === 'number' &&
    Array.isArray(trace.bpm)
  )
}

/**
 * Asks the watch to start recording the running workout: HealthKit launches
 * the watch app, or wakes it, with a workout configuration. Answers whether it
 * was asked; the watch says it is recording with a command of its own.
 */
export async function startWatchWorkout(): Promise<boolean> {
  try {
    return (await native?.startWatchWorkoutAsync?.()) ?? false
  } catch {
    return false
  }
}

/** The watch sent something into the inbox while JS was running. */
export function addWatchInboxListener(listener: () => void): () => void {
  const subscription = native?.addListener?.('onInbox', () => listener())
  return () => subscription?.remove()
}

/** A live heart rate reading, streamed while the watch can reach the phone. */
export function addWatchPulseListener(listener: (pulse: WatchPulse) => void): () => void {
  const subscription = native?.addListener?.('onPulse', (payload) => {
    if (
      typeof payload.workoutId === 'string' &&
      typeof payload.bpm === 'number' &&
      typeof payload.at === 'number'
    ) {
      listener({ workoutId: payload.workoutId, bpm: payload.bpm, at: payload.at })
    }
  })
  return () => subscription?.remove()
}

/** Pairing, installing or reaching the watch changed. */
export function addWatchStatusListener(listener: (status: WatchStatus) => void): () => void {
  const subscription = native?.addListener?.('onStatus', () => listener(watchStatus()))
  return () => subscription?.remove()
}
