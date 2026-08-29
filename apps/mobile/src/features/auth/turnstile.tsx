import * as Sentry from '@sentry/react-native'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
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
 * With `security_captcha_enabled` on, Supabase refuses any sign-in, mailed code
 * or password reset arriving without a token it can verify. Turnstile decides
 * whether to challenge by watching a page, so the page is inline HTML in a
 * hidden `WebView`.
 *
 * It fails open: no site key, a widget that will not load, a dropped network all
 * end with `undefined` and the request goes without a token. The control is on
 * the server, so failing closed adds no protection and does add a way for a
 * broken WebView to lock somebody out of their own account.
 *
 * Interaction-only, showing itself when Cloudflare wants a human. The same
 * WebView is restyled into a panel and never remounted, since a remount reloads
 * the page and throws away the challenge in progress.
 */

/** Whether this build can produce a token at all. */
export function captchaConfigured(): boolean {
  return isConfigured(env.EXPO_PUBLIC_TURNSTILE_SITE_KEY)
}

/**
 * `react-native-webview`, if this binary has it. Required rather than imported: a
 * TurboModule throws at import time on a build made before the dependency
 * landed, and a top-level import puts that throw in the module graph of every
 * `(auth)` screen. Absent, this file behaves as it does with no site key.
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
 * How long to wait for a token before giving up and sending none. Generous,
 * because the alternative is a request Supabase refuses, and short enough that a
 * widget which never answers does not hold a sign-in button hostage.
 *
 * Cancelled while a human is being asked to click something: twenty seconds is a
 * long time for a script and a short one for a person handed a puzzle.
 */
const TOKEN_TIMEOUT_MS = 20_000

type Pending = {
  resolve: (token: string | undefined) => void
  timer: ReturnType<typeof setTimeout> | null
  /** Retryable errors seen for THIS request. See `RETRIES_ALLOWED`. */
  errors: number
  /** A human is being asked to click something, so nothing here may give up. */
  interactive: boolean
}

/**
 * How many retryable failures one request sits through: one, so the widget gets
 * its automatic retry and no more. A `300*` bot score often clears on the second
 * attempt, and a visitor Cloudflare has decided against never will.
 */
const RETRIES_ALLOWED = 1

/**
 * Whether a Turnstile error code is worth waiting through: "try again" against
 * "this will never work".
 *
 * `300*` and `600*` are "bot behaviour detected" and retryable. The widget's own
 * `retry: 'auto'` has another go and Managed mode escalates to a checkbox, so
 * settling on the first turns a score that would have cleared into a refusal.
 *
 * The codes below are configuration and never recover. Enumerated rather than
 * matched by prefix, because `110600` and `110620` are retryable timeouts
 * sitting between the bad-sitekey and unlisted-hostname codes.
 *
 * Anything unrecognised is retryable: waiting costs one timeout, and giving up
 * wrongly costs an account nobody can get into.
 */
const FATAL_CODES = new Set([
  'unsupported', // ours: Turnstile says it cannot run in this browser at all

  '110100', // invalid sitekey
  '110110', // sitekey not found
  '110200', // this hostname is not on the widget's list
  '110420', // unexpected challenge type for this widget
  '110430', // the browser is unsupported
  '200100', // the visitor's clock is wrong
  '400010', // the widget was rendered on an unsupported page
  '400020', // invalid sitekey
  '400070', // the widget is disabled
])

function fatalCode(code: string): boolean {
  return FATAL_CODES.has(code)
}

/**
 * The page the WebView runs. `execution: 'execute'` means nothing happens until
 * `window.rcExecute()`, so the widget is not solving a challenge on every screen
 * that mounts this, and `refresh-expired: 'never'` because a token is used
 * within seconds.
 *
 * `error-callback` returns false. A truthy return tells Turnstile the page has
 * taken charge of the error, so a retryable `300*` became a hard refusal on the
 * first attempt, and a phone in a hidden WebView is exactly the profile that
 * scores badly once.
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
          // Returns FALSE on purpose. See the note on this function.
          'error-callback': function (code) { post({ type: 'error', code: String(code) }); return false },
          'timeout-callback': function () { post({ type: 'error', code: 'timeout' }) },
          'before-interactive-callback': function () { post({ type: 'interactive' }) },
          'after-interactive-callback': function () { post({ type: 'answered' }) },
          // The one failure that fires NO error-callback, so without this it is
          // twenty seconds of silence and then a timeout blamed on the network.
          'unsupported-callback': function () { post({ type: 'error', code: 'unsupported' }) },
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

/**
 * Says why the widget refused, somewhere a developer can read it. Every failure
 * here looks the same from outside, and four of the five causes live in a
 * dashboard rather than in this repo.
 *
 * Sentry as a message rather than an exception: nothing has thrown, and what is
 * wanted is the code attached to a build and a date.
 */
function report(what: string) {
  Sentry.captureMessage(`[captcha] ${what}`, 'warning')
}

/**
 * Once per launch rather than once per visit to sign-in: the absent-widget
 * report below fires on mount, and this stack is mounted again every time
 * somebody backs out and returns.
 */
let announcedAbsent = false

/** Asks for a token. Resolves `undefined` when there is none to be had. */
export type RequestCaptchaToken = () => Promise<string | undefined>

const CaptchaContext = createContext<RequestCaptchaToken>(async () => undefined)

/**
 * Wraps the screens that talk to Supabase's auth endpoints. On the `(auth)` stack
 * rather than at the root, because the WebView costs a remote script fetch that
 * most launches never need.
 */
export function CaptchaProvider({ children }: { children: ReactNode }) {
  const siteKey = env.EXPO_PUBLIC_TURNSTILE_SITE_KEY

  // Once. `require` is cached, but the warning above is not, and a component
  // that re-renders on every keystroke would print it on every keystroke.
  const WebViewImpl = useMemo(() => (captchaConfigured() ? loadWebView() : null), [])
  const enabled = WebViewImpl !== null

  /**
   * The failure with no symptom at all. A build whose site key never arrived, or
   * whose binary predates `react-native-webview`, sends no token, and with the
   * gate on Supabase refuses every sign-in that build makes. Nothing throws and
   * nothing logs.
   *
   * `EXPO_PUBLIC_` values are inlined at bundle time, so this is a property of
   * the build rather than the phone.
   */
  useEffect(() => {
    if (enabled || announcedAbsent) return
    announcedAbsent = true
    const why = captchaConfigured() ? 'no WebView in this binary' : 'no site key in this build'
    console.warn(`[captcha] sending no token: ${why}`)
    report(`absent: ${why}`)
  }, [enabled])

  const { t } = useTranslation(['auth', 'common'])

  const web = useRef<WebView>(null)
  const ready = useRef(false)
  /** Requests that arrived before the widget finished loading. */
  const queued = useRef<(() => void)[]>([])
  const pending = useRef<Pending | null>(null)
  const [challenging, setChallenging] = useState(false)

  /**
   * Set once this widget has proved it cannot produce a token. Without it a
   * broken widget costs twenty seconds per tap, since every failure mode is
   * silent and ends in the timeout. The first request waits and every one after
   * is answered immediately with `undefined`.
   */
  const broken = useRef(false)

  const settle = useCallback((token: string | undefined) => {
    const waiting = pending.current
    pending.current = null
    setChallenging(false)
    if (!waiting) return
    if (waiting.timer) clearTimeout(waiting.timer)
    waiting.resolve(token)
  }, [])

  /** Reports a widget that is not going to answer, and stops waiting on it. */
  const giveUp = useCallback(
    (why: string) => {
      if (!broken.current) {
        console.warn(`[captcha] turnstile unusable: ${why}`)
        report(`unusable: ${why}`)
      }
      broken.current = true
      settle(undefined)
    },
    [settle],
  )

  /** A load failure that only counts while the page has yet to announce itself. */
  const loadFailed = useCallback(
    (why: string) => {
      if (!ready.current) giveUp(why)
    },
    [giveUp],
  )

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
          if (waiting) {
            if (waiting.timer) clearTimeout(waiting.timer)
            waiting.timer = null
            waiting.interactive = true
          }
          setChallenging(true)
          return
        }
        case 'answered': {
          // The human is done with the widget, but the token has not arrived
          // yet — `callback` is a separate message. Take the panel down and put
          // the clock back on, or a challenge that was answered and then failed
          // would leave the request waiting for ever.
          const waiting = pending.current
          if (waiting) {
            waiting.interactive = false
            if (!waiting.timer) {
              waiting.timer = setTimeout(() => {
                report('no token after an answered challenge')
                settle(undefined)
              }, TOKEN_TIMEOUT_MS)
            }
          }
          setChallenging(false)
          return
        }
        case 'error': {
          const code = payload.code ?? 'unknown'

          // A failure BEFORE the widget ever announced itself is a failure of
          // the widget rather than of one attempt: a site key the account does
          // not know, or a hostname missing from its list. Those never recover,
          // so stop waiting on them.
          if (!ready.current) {
            giveUp(code)
            return
          }

          // Afterwards, the CODE decides. A configuration error is still
          // permanent and there is nothing to wait for.
          if (fatalCode(code)) {
            giveUp(code)
            return
          }

          // A retryable one buys the widget one more go. Settling on the first
          // would send the request with no token; settling on none would hold the
          // button until the timeout on every tap.
          //
          // Not while a human is answering: once the widget has escalated, an
          // error is one the person can retry inside it, and settling would take
          // the panel off the screen mid-click.
          console.warn(`[captcha] turnstile retryable error: ${code}`)
          const waiting = pending.current
          if (!waiting || waiting.interactive) return
          if (++waiting.errors > RETRIES_ALLOWED) {
            // Reported only once the retry has also failed, so a score that
            // cleared on the second go is not filed as a problem. A `300*` or
            // `600*` surviving both is the one failure here whose fix is the
            // widget's MODE rather than a key or a hostname.
            report(`gave up after ${waiting.errors} retryable errors, last ${code}`)
            settle(undefined)
          }
          return
        }
      }
    },
    [settle, giveUp],
  )

  const request = useCallback<RequestCaptchaToken>(() => {
    if (!enabled || broken.current) return Promise.resolve(undefined)

    // One at a time. Two overlapping requests would share one widget, and the
    // second `reset()` cancels the first's challenge — so the earlier caller is
    // let through without a token rather than left waiting for an answer that
    // is never coming.
    settle(undefined)

    return new Promise<string | undefined>((resolve) => {
      const waiting: Pending = { resolve, timer: null, errors: 0, interactive: false }
      // A timeout with the widget still silent means it never loaded. One that
      // fires after `ready` is one slow attempt, and the next may be fine.
      waiting.timer = setTimeout(() => {
        if (!ready.current) return giveUp('never became ready')
        // Ready, executed, and twenty seconds of silence: no token, no error
        // code, nothing to go on. Worth filing precisely because there is
        // nothing else to file.
        report('timed out with no answer')
        settle(undefined)
      }, TOKEN_TIMEOUT_MS)
      pending.current = waiting

      const execute = () => web.current?.injectJavaScript('window.rcExecute(); true;')
      if (ready.current) execute()
      else queued.current.push(execute)
    })
  }, [enabled, settle, giveUp])

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

          {/* THE ONE INSTANCE, AND IT IS ALWAYS THE SAME SIZE.
              Never unmounted, because a reload throws away a challenge in
              progress. And never resized either: the parent's opacity is what
              hides it. A widget laid out at 0x0 while it works and grown to
              300x72 only once Cloudflare asks for a human is a widget deciding
              whether to challenge inside a viewport with no room to draw one,
              and on Android a zero-sized WebView is not reliably given a layout
              pass at all. Opacity is a paint property; the page loads, the
              script runs, and the iframe has its real box throughout. */}
          <View style={{ width: 300, height: 72, marginTop: 12 }}>
            <WebViewImpl
              ref={web}
              // The widget is registered against a hostname and inline HTML has
              // none, so `baseUrl` gives the page one.
              //
              // The apex, and the widget has to list the apex too: an apex entry
              // covers every subdomain, where a `www` entry does not cover its
              // parent and would answer this page with 110200 for ever.
              source={{
                html: page(siteKey),
                baseUrl: `https://${env.EXPO_PUBLIC_TURNSTILE_ORIGIN}`,
              }}
              onMessage={onMessage}
              // The page could not load at all. Without this the only symptom is
              // `ready` never arriving, which every request pays the full timeout
              // to discover.
              //
              // Only before the widget is ready: Android reports subresource
              // failures through the same callbacks, so one beacon that did not
              // come back marked a working widget broken for the session.
              onError={() => loadFailed('load-failed')}
              onHttpError={() => loadFailed('http-error')}
              javaScriptEnabled
              domStorageEnabled
              /**
               * `about:` is load-bearing, and leaving it out breaks the widget
               * silently. Turnstile builds its challenge frame as an iframe with
               * a `srcdoc` attribute, which the WebView sees as a navigation to
               * `about:srcdoc`, and `originWhitelist` governs iframe navigations
               * too. Without it the widget loads, renders, reports `ready` and
               * can never produce a token.
               */
              originWhitelist={['https://*', 'about:*']}
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
 * The token for the next auth request, or `undefined`. Every call site passes
 * the result through to a `data/auth.ts` function whether or not this build has
 * a key, so switching the gate on is a configuration change.
 */
export function useCaptchaToken(): RequestCaptchaToken {
  return useContext(CaptchaContext)
}
