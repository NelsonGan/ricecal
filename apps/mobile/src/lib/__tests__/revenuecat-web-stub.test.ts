// metro.config.js swaps RevenueCat's web SDK for `stubs/purchases-js-hybrid-mappings`
// on iOS and Android. That is safe only while `react-native-purchases` never
// calls the SDK as it loads, so this loads the installed package against the
// stub. An upgrade that starts using it at import fails here, not at launch.
jest.mock('@revenuecat/purchases-js-hybrid-mappings', () =>
  jest.requireActual('../../../stubs/purchases-js-hybrid-mappings'),
)

const stub = jest.requireActual('../../../stubs/purchases-js-hybrid-mappings')

describe('the RevenueCat web SDK stub', () => {
  it('lets react-native-purchases load, browser mode included', () => {
    jest.isolateModules(() => {
      expect(() => require('react-native-purchases')).not.toThrow()
      expect(() => require('react-native-purchases/dist/browser/nativeModule')).not.toThrow()
      expect(() =>
        require('react-native-purchases/dist/browser/simulatedstore/purchaseSimulatedPackageHelper'),
      ).not.toThrow()
    })
  })

  it('can be read, logged and awaited without throwing', async () => {
    expect(() => stub.PurchasesCommon.getInstance).not.toThrow()
    expect(String(stub.PurchasesCommon)).toContain('not bundled')
    expect(JSON.stringify({ sdk: stub.PurchasesCommon })).toBe('{}')
    expect(stub.__esModule).toBeUndefined()
    await expect(Promise.resolve(stub)).resolves.toBe(stub)
  })

  it('throws a clear error the moment anything is called', () => {
    expect(() => stub.PurchasesCommon.configure({ apiKey: 'x' })).toThrow(
      "RevenueCat's browser mode is not bundled",
    )
    expect(() => stub.PurchasesCommon.getInstance().getOfferings()).toThrow('not bundled')
    expect(() => new stub.PurchasesCommon()).toThrow('not bundled')
  })
})
