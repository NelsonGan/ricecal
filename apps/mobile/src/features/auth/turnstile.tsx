import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import type WebView from 'react-native-webview'
import type { WebViewMessageEvent } from 'react-native-webview'

import { env, isConfigured } from '@/lib/env'
import { Button, Text } from '@/ui'

/**
 * Cloudflare Turnstile, in front of Supabase's auth endpoints.
 *
 * Supabase supports two captcha providers and this is one of them: with
 * `security_captcha_enabled` on, it refuses any sign-in, sign-up, mailed code
 * or password reset that arrives without a token it can verify against the
 * secret. That is the actual gate. Everything in this file exists to produce
 * the token that gets through it.
 *
 * WHY THERE IS A WEBVIEW IN AN AUTH SCREEN. Turnstile is a browser widget: it
 * decides whether to challenge by watching a page, and there is no way to run
 * that outside one. So the page is inline HTML in a hidden `WebView`, and the
 * app asks it for a token when it needs one.
 *
 * TWO THINGS ABOUT THIS ARE DELIBERATE AND EASY TO GET BACKWARDS.
 *
 * It FAILS OPEN. A build with no site key, a widget that will not load, a
 * network that drops halfway: all of them end with `undefined` and the request
 * goes without a token. That looks like the wrong direction for a security
 * control and is not, because the control is on the SERVER. Failing closed here
 * adds no protection Supabase is not already providing, and does add a way for
 * a broken WebView to lock somebody out of their own account. When the gate is
 * on and the token is missing, Supabase says so and the screen has a sentence
 * for it (`AuthProblem` reason `captcha`).
 *
 * And it is INTERACTION-ONLY. The widget runs invisibly and shows itself only
 * when Cloudflare wants a human to click something, which for a real person on
 * a phone is rare. That case cannot be answered silently, so it is answered
 * honestly: the same WebView is restyled into a panel over the screen, and the
 * token arrives when they have done it.
 *
 * RESTYLED, NOT REMOUNTED, and that is the one structural decision here. A
 * WebView moved to a different parent, or unmounted and brought back, reloads
 * the page and throws away the challenge in progress — so there is one instance,
 * always mounted, and `challenging` only changes its size and opacity.
 */

/** Whether this build can produce a token at all. */
export function captchaConfigured(): boolean {
  return isConfigured(env.EXPO_PUBLIC_TURNSTILE_SITE_KEY)
}

/**
 * `react-native-webview`, if this binary actually has it.
 *
 * REQUIRED RATHER THAN IMPORTED, for the reason `src/lib/health` gives about
 * its own native modules. A TurboModule throws at import time on a build made
 * before the dependency landed — "'RNCWebViewModule' could not be found" — and
 * a top-level import puts that throw in the module graph of every screen in
 * `(auth)`. The symptom is not a broken captcha, it is a white screen where
 * sign-in used to be, on every dev client that has not been rebuilt.
 *
 * Absent, this file behaves exactly as it does with no site key: no widget, no
 * token, and the request goes as it did before any of this existed.
 */
function loadWebView(): typeof WebView | null {
  try {
    // `require`, not `import`: a static one throws at module scope on a binary
    // without the native side, which is the case this whole function exists to
    // survive.
    return require('react-native-webview').default as typeof WebView
  } catch (error) {
    console.warn('[captcha] no WebView in this build, sending no captcha token', error)
    return null
  }
}

/**
 * How long to wait for a token before giving up and sending none.
 *
 * Generous, because the alternative to waiting is a request Supabase refuses.
 * Short enough that a widget which will never answer does not hold a sign-in
 * button hostage: past this the request goes without a token and the server
 * decides.
 *
 * The timer is cancelled while a human is being asked to click something.
 * Twenty seconds is a long time for a script and a short one for a person who
 * has just been handed a puzzle.
 */
const TOKEN_TIMEOUT_MS = 20_000

type Pending = {
  resolve: (token: string | undefined) => void
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * The page the WebView runs.
 *
 * `execution: 'execute'` means nothing happens until `window.rcExecute()` is
 * called, so the widget is not solving a challenge on every screen that mounts
 * this; `appearance: 'interaction-only'` means it stays invisible unless a
 * human is actually wanted.
 *
 * `refresh-expired: 'never'` because a token is used within seconds of arriving,
 * and a widget quietly refreshing itself in a hidden WebView for the rest of the
 * session is work nobody asked for.
 */
function page(siteKey: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
      #box { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    </style>
  </head>
  <body>
    <div id="box"><div id="widget"></div></div>
    <script>
      var post = function (payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload))
      }
      var id = null
      window.onloadTurnstileCallback = function () {
        id = window.turnstile.render('#widget', {
          sitekey: ${JSON.stringify(siteKey)},
          execution: 'execute',
          appearance: 'interaction-only',
          'refresh-expired': 'never',
          callback: function (token) { post({ type: 'token', token: token }) },
          'error-callback': function (code) { post({ type: 'error', code: String(code) }); return true },
          'timeout-callback': function () { post({ type: 'error', code: 'timeout' }) },
          'before-interactive-callback': function () { post({ type: 'interactive' }) },
        })
        post({ type: 'ready' })
      }
      window.rcExecute = function () {
        if (id === null) return
        // Reset first: a widget still holding the token it produced a minute
        // ago answers instantly with one Supabase has already spent.
        window.turnstile.reset(id)
        window.turnstile.execute(id)
      }
    </script>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit" async defer></script>
  </body>
</html>`
}

/** Asks for a token. Resolves `undefined` when there is none to be had. */
export type RequestCaptchaToken = () => Promise<string | undefined>

const CaptchaContext = createContext<RequestCaptchaToken>(async () => undefined)

/**
 * Wraps the screens that talk to Supabase's auth endpoints.
 *
 * Mounted on the `(auth)` stack rather than at the root: the WebView costs a
 * remote script fetch, and every launch paying for it would be a launch paying
 * for a screen most of them never see.
 */
export function CaptchaProvider({ children }: { children: ReactNode }) {
  const siteKey = env.EXPO_PUBLIC_TURNSTILE_SITE_KEY

  // Once. `require` is cached, but the warning above is not, and a component
  // that re-renders on every keystroke would print it on every keystroke.
  const WebViewImpl = useMemo(() => (captchaConfigured() ? loadWebView() : null), [])
  const enabled = WebViewImpl !== null

  const { t } = useTranslation(['auth', 'common'])

  const web = useRef<WebView>(null)
  const ready = useRef(false)
  /** Requests that arrived before the widget finished loading. */
  const queued = useRef<(() => void)[]>([])
  const pending = useRef<Pending | null>(null)
  const [challenging, setChallenging] = useState(false)

  const settle = useCallback((token: string | undefined) => {
    const waiting = pending.current
    pending.current = null
    setChallenging(false)
    if (!waiting) return
    if (waiting.timer) clearTimeout(waiting.timer)
    waiting.resolve(token)
  }, [])

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let payload: { type?: string; token?: string; code?: string }
      try {
        payload = JSON.parse(event.nativeEvent.data)
      } catch {
        return
      }

      switch (payload.type) {
        case 'ready':
          ready.current = true
          for (const run of queued.current.splice(0)) run()
          return
        case 'token':
          settle(payload.token)
          return
        case 'interactive': {
          // Cloudflare wants a human. There is no silent answer, so show the
          // widget and stop counting down: the timeout is there to keep a dead
          // script from blocking a button, not to hurry somebody along.
          const waiting = pending.current
          if (waiting?.timer) {
            clearTimeout(waiting.timer)
            waiting.timer = null
          }
          setChallenging(true)
          return
        }
        case 'error':
          // Reported and then forgotten. The request goes without a token and
          // the server decides, which is the whole failing-open bargain.
          console.warn(`[captcha] turnstile error: ${payload.code}`)
          settle(undefined)
          return
      }
    },
    [settle],
  )

  const request = useCallback<RequestCaptchaToken>(() => {
    if (!enabled) return Promise.resolve(undefined)

    // One at a time. Two overlapping requests would share one widget, and the
    // second `reset()` cancels the first's challenge — so the earlier caller is
    // let through without a token rather than left waiting for an answer that
    // is never coming.
    settle(undefined)

    return new Promise<string | undefined>((resolve) => {
      const waiting: Pending = { resolve, timer: null }
      waiting.timer = setTimeout(() => settle(undefined), TOKEN_TIMEOUT_MS)
      pending.current = waiting

      const execute = () => web.current?.injectJavaScript('window.rcExecute(); true;')
      if (ready.current) execute()
      else queued.current.push(execute)
    })
  }, [enabled, settle])

  return (
    <CaptchaContext.Provider value={request}>
      {children}
      {enabled ? (
        <View
          // Absolute rather than in flow, so the invisible state takes no space
          // and the visible one covers whatever screen asked for it. Untouchable
          // until there is something to touch: a 0x0 view can still eat a press
          // on Android.
          pointerEvents={challenging ? 'auto' : 'none'}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: challenging ? 'rgba(0,0,0,0.55)' : 'transparent',
            opacity: challenging ? 1 : 0,
          }}
        >
          <View
            className="w-[320px] items-center gap-4 rounded-lg bg-surface p-5"
            style={{ display: challenging ? 'flex' : 'none' }}
          >
            <Text variant="bodyStrong">{t('auth:captcha.title')}</Text>
            <Text variant="meta" className="text-center">
              {t('auth:captcha.body')}
            </Text>
          </View>

          {/* THE ONE INSTANCE. Sized down to nothing when idle rather than
              unmounted: a reload here throws away a challenge in progress. */}
          <View
            style={
              challenging
                ? { width: 300, height: 72, marginTop: 12 }
                : { width: 0, height: 0, opacity: 0 }
            }
          >
            <WebViewImpl
              ref={web}
              // The widget is registered against a hostname on Cloudflare, and
              // inline HTML has none. `baseUrl` is what gives the page one.
              source={{
                html: page(siteKey),
                baseUrl: `https://${env.EXPO_PUBLIC_TURNSTILE_ORIGIN}`,
              }}
              onMessage={onMessage}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['https://*']}
              scrollEnabled={false}
              style={{ flex: 1, backgroundColor: 'transparent' }}
            />
          </View>

          {challenging ? (
            <Button variant="ghost" className="mt-3" onPress={() => settle(undefined)}>
              {t('common:action.cancel')}
            </Button>
          ) : null}
        </View>
      ) : null}
    </CaptchaContext.Provider>
  )
}

/**
 * The token for the next auth request, or `undefined`.
 *
 * Every call site passes the result straight through to a `data/auth.ts`
 * function whether or not this build has a key, so switching the gate on is a
 * configuration change and never a code change.
 */
export function useCaptchaToken(): RequestCaptchaToken {
  return useContext(CaptchaContext)
}
