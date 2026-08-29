import { WIDGET_KINDS, type WidgetKind } from '@modules/ricecal-widgets'
import { type Href, Redirect, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useSession } from '@/data'
import { track, type WidgetTarget } from '@/lib/analytics'
import { Spinner } from '@/ui'

/**
 * Where every widget tap lands.
 *
 * A widget could link straight at `ricecal://log?panel=camera` and the right
 * screen would open, invisibly: nothing downstream can tell a tap off a home
 * screen from the log button being pressed, and "is anybody using these" is the
 * only question the widgets have to answer. So every link crosses here first,
 * `Widget Opened` is fired, and `/log` is one redirect further on.
 *
 * The same shape as `auth/[action]`, for the same reasons: the router matches
 * paths against files, so a path with no file opens the app on "Page not found",
 * and a `<Redirect>` inside a route cannot run before the navigator is mounted.
 */

/** Where each target goes, once there is a session to go there with. */
const DESTINATIONS = {
  // The four panels of the log sheet, spelt as its own `?panel=` param spells
  // them. `barcode` is a tab inside the camera rather than a panel of its own,
  // and `openingPanel` in `log/index.tsx` is what resolves it.
  camera: '/log?panel=camera',
  search: '/log?panel=search',
  barcode: '/log?panel=barcode',
  recipes: '/log?panel=recipes',
  // The tank is on Today, under the ring. There is no route that opens the
  // water sheet, and inventing one so a widget could deep-link into it would be
  // a second way to reach a control that is one tap from where this lands.
  water: '/today',
  // Weight is a tab on Trends, which is where a weigh-in is recorded.
  weight: '/trends',
  open: '/today',
} as const satisfies Record<WidgetTarget, string>

const isTarget = (value: string | undefined): value is WidgetTarget =>
  value !== undefined && value in DESTINATIONS

const isKind = (value: string | undefined): value is WidgetKind =>
  (WIDGET_KINDS as readonly string[]).includes(value ?? '')

export default function WidgetLanding() {
  const { action, w } = useLocalSearchParams<{ action?: string; w?: string }>()
  const { session, loading } = useSession()

  /**
   * The target the widget named, or the widget having named nothing useful.
   *
   * Both params come off a URL, which is to say off a build of the extension
   * that may be older than this one. An unknown target lands on Today, which is
   * where `open` lands and is never the wrong screen to be on.
   */
  const target: WidgetTarget = isTarget(action) ? action : 'open'
  const widget: WidgetKind | null = isKind(w) ? w : null

  /**
   * ONCE PER ARRIVAL, and the ref is what makes that true.
   *
   * This route redirects the moment the session resolves, so it renders at
   * least twice on a cold start — once waiting and once redirecting — and a
   * plain effect would count the tap twice. Fast Refresh would count it again.
   */
  const announced = useRef(false)
  useEffect(() => {
    if (announced.current || !widget) return
    announced.current = true
    track('Widget Opened', { widget, target })
  }, [widget, target])

  /**
   * The same dead-end guard `auth/[action]` carries.
   *
   * A widget can be tapped by somebody who has since signed out, and the
   * keychain read that would say so does not always resolve — offline it is a
   * refresh sitting in backoff. Long enough that a slow start is not cut off,
   * short enough that nobody is left on a spinner.
   */
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 8000)
    return () => clearTimeout(timer)
  }, [])

  // `/` rather than `/today`: index is the one place that knows whether this
  // account has finished onboarding, and a tap with no session belongs back at
  // welcome rather than on a diary it cannot read.
  if (waited && !session) return <Redirect href="/" />

  if (!loading && session) return <Redirect href={DESTINATIONS[target] as Href} />

  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Spinner />
    </View>
  )
}
