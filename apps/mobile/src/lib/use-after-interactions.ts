import { useEffect, useState } from 'react'

/**
 * However long the thread stays busy, this is the longest anything waits.
 *
 * `requestIdleCallback` has no obligation to run at all on a device that never goes
 * idle, and content that never arrives is worse than content that arrives late.
 */
const LATEST_MS = 400

/**
 * Runs `then` when the thread is free, and hands back the way to cancel it.
 *
 * `requestIdleCallback` rather than `InteractionManager`, which is what this would
 * have used until recently: React Native deprecated it in 0.86 and says to use this
 * instead. The `timeout` is the half it does not give for free — an idle callback is
 * allowed to wait forever, and this one has a deadline.
 *
 * It is React Native's, not the language's, so it is absent wherever the runtime is
 * not a device — Jest being the one that matters here. The fallback is a zero
 * timeout, which is the same promise one frame later and is what a test wants anyway.
 */
function whenIdle(then: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(then, { timeout: LATEST_MS })
    return () => cancelIdleCallback(handle)
  }

  const timer = setTimeout(then, 0)
  return () => clearTimeout(timer)
}

/**
 * False on the frame something mounts, then true as soon as the thread is free.
 *
 * For content heavy enough to be worth not building on the frame something opens. A
 * sheet's panel rises on the UI thread, but the effect that STARTS that rise runs on
 * the JS thread — so a body that takes eighty milliseconds to mount delays the
 * animation by eighty milliseconds, and the sheet appears to stick before it moves.
 * Anything gated on this is built after the movement rather than instead of it.
 *
 * `active` is what resets it. A sheet that closes and reopens has to stage its
 * content again rather than remember that it once finished.
 */
export function useAfterInteractions(active = true): boolean {
  const [staged, setStaged] = useState(false)

  useEffect(() => {
    if (!active) return

    const cancel = whenIdle(() => setStaged(true))

    return () => {
      // Cancelled on the way out: resolving against something that has closed is a
      // state update nobody is listening for. And forgotten, so the next opening
      // stages again from nothing — which is the whole point.
      cancel()
      setStaged(false)
    }
  }, [active])

  // Read through `active` rather than reset by it, so closing takes effect on the
  // render that closed rather than one commit later. That also keeps the inactive
  // case free of state updates entirely, which is what a sheet spends most of its
  // life being.
  return active && staged
}
