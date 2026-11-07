// Stands in for RevenueCat's web SDK on iOS and Android (see metro.config.js).
// `react-native-purchases` only reaches it in "browser mode", which it enters
// when its native module is missing: Expo Go, the web, or the Rork sandbox. No
// build of this app is any of those. If one ever is, this says so instead of
// failing on `undefined`.
function unavailable() {
  throw new Error(
    "RevenueCat's browser mode is not bundled in this app. It runs only where " +
      'the native RNPurchases module is missing, which a RiceCal build never is.',
  )
}

// Every method throws when called. Reading a property does not, so a debugger
// preview or a promise check on the object is not mistaken for a call.
module.exports = {
  PurchasesCommon: new Proxy(
    {},
    { get: (_, key) => (typeof key === 'symbol' || key === 'then' ? undefined : unavailable) },
  ),
}
