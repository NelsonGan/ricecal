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
 * always mounted at one size, and `challenging` changes nothing but the opacity
 * of the layer it sits in.
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
  /** Retryable errors seen for THIS request. See `RETRIES_ALLOWED`. */
  errors: number
  /** A human is being asked to click something, so nothing here may give up. */
  interactive: boolean
}

/**
 * How many retryable failures one request sits through before giving up.
 *
 * One, which is to say the widget gets its automatic retry and no more. The
 * point of waiting at all is that a `300*` bot score often clears on the second
 * attempt; the point of not waiting for ever is that a visitor Cloudflare has
 * genuinely decided against will never clear, and holding the sign-in button
 * for the full twenty second timeout on every tap is the failure this whole
 * file already has a `broken` flag to avoid.
 */
const RETRIES_ALLOWED = 1

/**
 * Whether a Turnstile error code is worth waiting through, and it is the
 * difference between "try again" and "this will never work".
 *
 * Cloudflare marks each of its codes retryable or not, and the two want
 * opposite treatment:
 *
 * - `300*` and `600*` are "bot behaviour detected" and they are RETRYABLE. The
 *   widget's own `retry: 'auto'` has another go, and in Managed mode a visitor
 *   who keeps scoring badly is escalated to a checkbox instead. Settling on the
 *   first one turns a score that would have cleared into "we could not confirm
 *   you are a person", which is what a real person on a phone was being told.
 * - The ones LISTED BELOW are configuration, and they never recover. The first
 *   one ends it for the session rather than costing every later tap a round
 *   trip to rediscover the same thing.
 *
 * ENUMERATED RATHER THAN MATCHED BY PREFIX, because `110` is not one family:
 * `110100`, `110110` and `110200` are a bad sitekey and an unlisted hostname,
 * and `110600` and `110620` are timeouts sitting in the middle of them that
 * Cloudflare marks retryable. A `/^110/` would have given up on a challenge
 * that had merely taken too long.
 *
 * Anything unrecognised is treated as retryable, because the cost of waiting is
 * one timeout and the cost of giving up wrongly is an account nobody can get
 * into.
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
 *
 * `error-callback` RETURNS FALSE, and returning true is what it did. A truthy
 * return tells Turnstile the page has taken charge of the error — and what this
 * page then did was give up on the spot, so a `300*` "bot behaviour detected"
 * score, which Cloudflare documents as retryable and which the widget's own
 * `retry: 'auto'` would have had another go at, became a hard refusal on the
 * first attempt. That is the failure a real person hits: a phone in a hidden
 * WebView is exactly the profile that scores badly once. False leaves the retry
 * where it belongs. The native side is posted the code either way and decides
 * separately whether it is worth waiting through — see `fatalCode`.
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
 * Says WHY the widget refused, somewhere a developer can read it.
 *
 * EVERY FAILURE ON THIS PATH LOOKS THE SAME FROM THE OUTSIDE, and that is what
 * made the first one expensive. The gate is on the server, so a widget that
 * cannot produce a token and a token the server will not accept both end as
 * "we could not confirm you are a person" — and so does a hostname missing from
 * the widget's list, a site key that never reached the build, and a visitor
 * Cloudflare has scored as a bot. Five causes, one sentence, and four of the
 * five live in a dashboard rather than in this repo.
 *
 * A console warning only reaches somebody holding a cable. This goes to Sentry
 * as a MESSAGE rather than an exception: nothing has thrown, the app is working
 * exactly as designed, and what is wanted is the code — `110200` is a hostname,
 * `400020` is a site key, `300*` is a score — attached to a build and a date.
 *
 * The code and nothing else. No address, no token, nothing about who was
 * signing in; see the analytics note in CLAUDE.md for why that line is drawn
 * where it is.
 */
function report(what: string) {
  Sentry.captureMessage(`[captcha] ${what}`, 'warning')
}

/**
 * Once per launch, not once per visit to the sign-in screen.
 *
 * The absent-widget report below fires on mount, and this stack is mounted
 * again every time somebody backs out of sign-in and returns to it.
 */
let announcedAbsent = false

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

  /**
   * THE FAILURE WITH NO SYMPTOM AT ALL, and the one worth catching hardest.
   *
   * A build whose `EXPO_PUBLIC_TURNSTILE_SITE_KEY` never arrived, or whose
   * binary predates `react-native-webview`, asks for no token and sends none —
   * and with the gate on, Supabase then refuses every sign-in, signup, code and
   * reset that build ever makes. Nothing throws, nothing logs, and the app says
   * the same sentence it says for a captcha that was merely wrong. It is
   * indistinguishable from the outside from a Cloudflare problem, which is
   * exactly the wrong place to go looking.
   *
   * `EXPO_PUBLIC_` values are inlined at BUNDLE time, so this is a property of
   * the build rather than of the phone, and one report per launch is enough to
   * tell the two apart for good.
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
   * Set once this widget has proved it cannot produce a token.
   *
   * WITHOUT THIS, A BROKEN WIDGET COSTS TWENTY SECONDS PER TAP. The failure
   * modes are all silent — a site key the account does not recognise, a
   * hostname missing from the widget's list, a `render()` that throws before
   * `ready` is ever posted — and every one of them ends in the timeout rather
   * than in an error. So the first request waits, and every request after it is
   * answered immediately with `undefined`.
   *
   * The outcome for the user is the same either way, and that is the point:
   * with the gate on, a request with no token is refused, so the choice is
   * between being told at once and being told after twenty seconds of spinner.
   * With the gate off, nothing was ever going to check.
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

          // And a retryable one buys the widget one more go. Settling on the
          // first would send the request with no token and hand the person a
          // captcha failure they had no way to answer, which is exactly what a
          // `300*` bot score was doing to real people; settling on none of them
          // would hold the button until the timeout on every single tap.
          //
          // NOT WHILE A HUMAN IS ANSWERING, though. Once the widget has
          // escalated, an error is one the person can have another go at inside
          // it, and settling would take the panel off the screen mid-click and
          // send the request without the token they were in the middle of
          // earning. Same reasoning as the cancelled timer above.
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
              // The widget is registered against a hostname on Cloudflare, and
              // inline HTML has none. `baseUrl` is what gives the page one.
              //
              // THE APEX, AND THE WIDGET HAS TO LIST THE APEX TOO. Cloudflare's
              // hostname rule runs one way: an apex entry covers every
              // subdomain, a `www` entry does not cover its parent. The
              // marketing site redirects the apex to `www`, so `www` is the
              // easy thing to list and it would answer this page with 110200
              // for ever. See the README.
              source={{
                html: page(siteKey),
                baseUrl: `https://${env.EXPO_PUBLIC_TURNSTILE_ORIGIN}`,
              }}
              onMessage={onMessage}
              // The page could not load at all: no network, a DNS failure, or
              // Cloudflare refusing the origin. Without this the only symptom is
              // `ready` never arriving, which every request then pays the full
              // timeout to discover.
              //
              // ONLY BEFORE THE WIDGET IS READY, though. Android reports
              // subresource failures through the same two callbacks, so a
              // single image or beacon that did not come back was marking a
              // perfectly working widget permanently broken for the rest of the
              // session — and every sign-in after it went out with no token.
              // Once `ready` has arrived the page loaded, whatever else failed.
              onError={() => loadFailed('load-failed')}
              onHttpError={() => loadFailed('http-error')}
              javaScriptEnabled
              domStorageEnabled
              /**
               * `about:` IS LOAD-BEARING, AND LEAVING IT OUT BREAKS THE WHOLE
               * WIDGET SILENTLY.
               *
               * Turnstile builds its challenge frame as an iframe with a
               * `srcdoc` attribute, which the WebView sees as a navigation to
               * `about:srcdoc`. `originWhitelist` governs iframe navigations as
               * well as top-level ones, so a list of `https://*` alone does not
               * merely ignore that frame — react-native-webview refuses to load
               * it internally and hands the URL to the OS instead, which
               * answers "Unable to open URL: about:srcdoc" in the log and
               * nothing anywhere else.
               *
               * The result is a widget that loads, renders, reports `ready` and
               * can never produce a token, on a page where every key, hostname
               * and mode is correct. It cost a day: the symptom is on the
               * SERVER — Supabase refusing every sign-in for want of a token —
               * so the search starts in the Cloudflare dashboard, where
               * everything looks right, because everything there is right.
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
 * The token for the next auth request, or `undefined`.
 *
 * Every call site passes the result straight through to a `data/auth.ts`
 * function whether or not this build has a key, so switching the gate on is a
 * configuration change and never a code change.
 */
export function useCaptchaToken(): RequestCaptchaToken {
  return useContext(CaptchaContext)
}
