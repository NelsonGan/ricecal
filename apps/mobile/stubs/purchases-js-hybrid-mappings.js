// Stands in for RevenueCat's web SDK on iOS and Android (see metro.config.js).
// `react-native-purchases` only reaches it in "browser mode", which it enters
// when its native module is missing: Expo Go, the web, or the Rork sandbox. No
// build of this app is any of those. If one ever is, this says so instead of
// failing on `undefined`.
//
// Every export, and everything read off one, is this same stand-in, so loading
// the module and reading from it never throws. Calling or constructing anything
// does. Keys a debugger, a logger or a promise check reads are answered plainly.
function unavailable() {
  throw new Error(
    "RevenueCat's browser mode is not bundled in this app. It runs only where " +
      'the native RNPurchases module is missing, which a RiceCal build never is.',
  )
}

const LABEL = '[RevenueCat browser mode: not bundled]'
const ABSENT = new Set(['then', 'toJSON', '__esModule', '$$typeof'])

const stub = new Proxy(function stand() {}, {
  get(_, key) {
    if (typeof key === 'symbol' || ABSENT.has(key)) return undefined
    if (key === 'toString' || key === 'valueOf') return () => LABEL
    return stub
  },
  apply: unavailable,
  construct: unavailable,
})

module.exports = stub
