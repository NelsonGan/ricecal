import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { CaptchaProvider, type RequestCaptchaToken, useCaptchaToken } from '../turnstile'

/**
 * The widget's silent timeout, which with the gate on used to mean a refused
 * sign-in. Of the people it happened to, most tried once and never got in, and
 * the ones who tapped again usually did, so the provider now makes that second
 * attempt itself.
 *
 * The WebView is a stand-in that records what the provider injects and lets a
 * test post the page's messages back.
 */

jest.mock('@/lib/env', () => ({
  env: { EXPO_PUBLIC_TURNSTILE_SITE_KEY: 'site-key', EXPO_PUBLIC_TURNSTILE_ORIGIN: 'ricecal.app' },
  isConfigured: (value: string | undefined) => Boolean(value),
}))

jest.mock('@/lib/errors', () => ({ reportMessage: jest.fn() }))

const mockInjected: string[] = []
let mockPost: (payload: object) => void = () => {}

jest.mock('react-native-webview', () => {
  const { forwardRef, useImperativeHandle } = require('react')
  const WebView = forwardRef(
    (props: { onMessage: (event: { nativeEvent: { data: string } }) => void }, ref: unknown) => {
      useImperativeHandle(ref, () => ({
        injectJavaScript: (script: string) => mockInjected.push(script),
      }))
      mockPost = (payload) => props.onMessage({ nativeEvent: { data: JSON.stringify(payload) } })
      return null
    },
  )
  return { __esModule: true, default: WebView }
})

const { reportMessage } = jest.requireMock('@/lib/errors') as { reportMessage: jest.Mock }

const executions = () => mockInjected.filter((script) => script.includes('rcExecute')).length

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <CaptchaProvider>{children}</CaptchaProvider>
    </ThemeProvider>
  )
}

async function ready(): Promise<RequestCaptchaToken> {
  const { result } = await renderHook(() => useCaptchaToken(), { wrapper })
  await act(async () => mockPost({ type: 'ready' }))
  return result.current
}

/** Starts a request and returns a probe for how it settled. */
async function ask(request: RequestCaptchaToken) {
  const outcome: { done: boolean; token?: string } = { done: false }
  await act(async () => {
    request().then((token) => {
      outcome.done = true
      outcome.token = token
    })
  })
  return outcome
}

const wait = (ms: number) => act(async () => jest.advanceTimersByTime(ms))

beforeEach(() => {
  jest.useFakeTimers()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  mockInjected.length = 0
  reportMessage.mockClear()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

it('answers with the token when the widget answers in time', async () => {
  const outcome = await ask(await ready())
  expect(executions()).toBe(1)

  await act(async () => mockPost({ type: 'token', token: 'abc' }))

  expect(outcome).toEqual({ done: true, token: 'abc' })
  expect(reportMessage).not.toHaveBeenCalled()
})

it('runs the widget again after one silent timeout instead of giving up', async () => {
  const outcome = await ask(await ready())

  await wait(20_000)
  // Still waiting, and the widget has been reset and run a second time.
  expect(outcome.done).toBe(false)
  expect(executions()).toBe(2)

  await act(async () => mockPost({ type: 'token', token: 'second-try' }))

  expect(outcome).toEqual({ done: true, token: 'second-try' })
  expect(reportMessage).toHaveBeenCalledWith('[captcha] answered after a timeout retry')
})

it('goes without a token after the retry also times out', async () => {
  const outcome = await ask(await ready())

  await wait(20_000)
  await wait(20_000)

  expect(outcome).toEqual({ done: true, token: undefined })
  expect(executions()).toBe(2)
  expect(reportMessage).toHaveBeenCalledWith('[captcha] timed out with no answer')
})

it('does not retry a request that was replaced by a newer one', async () => {
  const request = await ready()
  const first = await ask(request)
  // A second request settles the first without a token, as before.
  const second = await ask(request)
  expect(first).toEqual({ done: true, token: undefined })

  await wait(20_000)
  // Only the live request's retry ran: two executes for two requests, plus one.
  expect(executions()).toBe(3)
  expect(second.done).toBe(false)
})
