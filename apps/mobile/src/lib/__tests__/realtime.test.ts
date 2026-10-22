import type { AppStateStatus } from 'react-native'

type FakeChannel = {
  topic: string
  config: unknown
  emit: (event: string, payload: Record<string, unknown>) => void
  status: (status: string, error?: Error) => void
}

const channels: FakeChannel[] = []
const removals: Array<{ channel: FakeChannel; finish: () => void; fail: () => void }> = []
let appStateHandler: ((state: AppStateStatus) => void) | null = null
const mockDisconnect = jest.fn()

jest.mock('../supabase', () => ({
  supabase: {
    channel: (topic: string, options: { config: unknown }) => {
      let onBroadcast: (message: { event: string; payload: Record<string, unknown> }) => void
      let onStatus: (status: string, error?: Error) => void
      const fake = {
        topic: `realtime:${topic}`,
        config: options.config,
        emit: (event: string, payload: Record<string, unknown>) => onBroadcast({ event, payload }),
        status: (status: string, error?: Error) => onStatus(status, error),
        on: (_type: string, _filter: unknown, callback: typeof onBroadcast) => {
          onBroadcast = callback
          return fake
        },
        subscribe: (callback: typeof onStatus) => {
          onStatus = callback
          return fake
        },
      }
      channels.push(fake)
      return fake
    },
    removeChannel: (channel: FakeChannel) =>
      new Promise<string>((resolve) => {
        removals.push({
          channel,
          finish: () => {
            channels.splice(channels.indexOf(channel), 1)
            channel.status('CLOSED')
            resolve('ok')
          },
          // The server answered the leave with an error: still listed.
          fail: () => resolve('error'),
        })
      }),
    getChannels: () => channels,
    realtime: { disconnect: () => mockDisconnect() },
  },
}))

let listen: typeof import('../realtime').listen

beforeEach(() => {
  mockDisconnect.mockClear()
  channels.length = 0
  removals.length = 0
  appStateHandler = null
  jest.isolateModules(() => {
    const { AppState } = require('react-native')
    AppState.currentState = 'active'
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type: unknown, handler: unknown) => {
        appStateHandler = handler as (state: AppStateStatus) => void
        return { remove: jest.fn() }
      })
    listen = require('../realtime').listen
  })
})

const listener = () => ({ onEvent: jest.fn(), onLive: jest.fn() })
const settle = () => new Promise((resolve) => setImmediate(resolve))

it('shares one private channel among everyone listening on a topic', () => {
  const first = listener()
  const second = listener()
  listen('group-chat:g1:2026-10-22', first)
  listen('group-chat:g1:2026-10-22', second)
  expect(channels).toHaveLength(1)
  expect(channels[0]?.config).toEqual({ private: true })

  channels[0]?.status('SUBSCRIBED')
  channels[0]?.emit('message', { ids: ['m1'] })
  for (const each of [first, second]) {
    expect(each.onLive).toHaveBeenCalledWith(true)
    expect(each.onEvent).toHaveBeenCalledWith('message', { ids: ['m1'] })
  }
})

it('tells a late listener the channel is already live', () => {
  listen('t', listener())
  channels[0]?.status('SUBSCRIBED')
  const late = listener()
  listen('t', late)
  expect(late.onLive).toHaveBeenCalledWith(true)
})

it('leaves when the last listener does, and joins again only once the leave is done', async () => {
  const stopFirst = listen('t', listener())
  const stopSecond = listen('t', listener())
  stopFirst()
  expect(removals).toHaveLength(0)
  stopSecond()
  expect(removals).toHaveLength(1)

  // Back before the leave finished: supabase would hand back the leaving channel.
  const again = listener()
  listen('t', again)
  expect(channels).toHaveLength(1)
  removals[0]?.finish()
  await settle()
  expect(channels).toHaveLength(1)
  expect(channels[0]).not.toBe(removals[0]?.channel)
  channels[0]?.status('SUBSCRIBED')
  expect(again.onLive).toHaveBeenLastCalledWith(true)
})

it('forgets the topic once nothing listens, leaving the socket to linger in front', async () => {
  const stop = listen('t', listener())
  stop()
  stop()
  expect(removals).toHaveLength(1)
  removals[0]?.finish()
  await settle()
  expect(channels).toHaveLength(0)
  // In front, the library's own short linger closes the socket.
  expect(mockDisconnect).not.toHaveBeenCalled()

  // Backgrounded during that linger, it goes at once.
  appStateHandler?.('background')
  expect(mockDisconnect).toHaveBeenCalledTimes(1)
})

it('closes in the background and rejoins in front, but not for the notification shade', async () => {
  const each = listener()
  listen('t', each)
  channels[0]?.status('SUBSCRIBED')

  appStateHandler?.('inactive')
  expect(removals).toHaveLength(0)

  appStateHandler?.('background')
  expect(each.onLive).toHaveBeenLastCalledWith(false)
  removals[0]?.finish()
  await settle()
  expect(channels).toHaveLength(0)
  expect(mockDisconnect).toHaveBeenCalledTimes(1)

  appStateHandler?.('active')
  expect(channels).toHaveLength(1)
  channels[0]?.status('SUBSCRIBED')
  expect(each.onLive).toHaveBeenLastCalledWith(true)
})

it('reports a dropped channel as not live, so the caller can poll', () => {
  const each = listener()
  listen('t', each)
  channels[0]?.status('SUBSCRIBED')
  channels[0]?.status('CHANNEL_ERROR')
  expect(each.onLive).toHaveBeenLastCalledWith(false)
})

it('stops trying a topic the policy refuses, until everyone has left it', async () => {
  const each = listener()
  const stop = listen('t', each)
  channels[0]?.status('CHANNEL_ERROR', new Error('Unauthorized: You do not have permissions'))
  expect(removals).toHaveLength(1)
  removals[0]?.finish()
  await settle()
  expect(channels).toHaveLength(0)
  expect(each.onLive).not.toHaveBeenCalledWith(true)

  stop()
  listen('t', listener())
  expect(channels).toHaveLength(1)
})

it('rejoins a channel the server closed, after a pause', async () => {
  jest.useFakeTimers()
  try {
    const each = listener()
    listen('t', each)
    const first = channels[0]
    first?.status('SUBSCRIBED')
    channels.splice(0, 1)
    first?.status('CLOSED')
    expect(each.onLive).toHaveBeenLastCalledWith(false)
    expect(removals).toHaveLength(0)
    expect(channels).toHaveLength(0)
    jest.advanceTimersByTime(3_000)
    expect(channels).toHaveLength(1)
    channels[0]?.status('SUBSCRIBED')
    expect(each.onLive).toHaveBeenLastCalledWith(true)
  } finally {
    jest.useRealTimers()
  }
})

it('leaves a topic whose leave the server refused to polling, and still sleeps in the background', async () => {
  const stop = listen('t', listener())
  stop()
  removals[0]?.fail()
  await settle()
  // Still listed, so joining again would get that same channel back.
  expect(channels).toHaveLength(1)
  const again = listener()
  listen('t', again)
  expect(channels).toHaveLength(1)
  expect(again.onLive).not.toHaveBeenCalled()

  appStateHandler?.('background')
  expect(mockDisconnect).toHaveBeenCalledTimes(1)
})
