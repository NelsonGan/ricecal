import { readFileSync } from 'node:fs'
import ts from 'typescript'

/** Exercise the installed JS wrapper: its native promises must reach our ordered adapter. */
it('preserves native completion and rejection for every queued Mixpanel operation', async () => {
  const native = {
    track: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
    registerSuperProperties: jest.fn(),
    set: jest.fn(),
    deleteUser: jest.fn(),
    flush: jest.fn(),
  }
  const source = readFileSync(require.resolve('mixpanel-react-native'), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  type AsyncMethod = (...args: unknown[]) => Promise<void>
  type Wrapper = Record<
    'track' | 'identify' | 'reset' | 'registerSuperProperties' | 'flush',
    AsyncMethod
  > & {
    getPeople(): Record<'set' | 'deleteUser', AsyncMethod>
  }
  const module = { exports: {} as { Mixpanel: new (token: string, automatic: boolean) => Wrapper } }
  const dependency = (name: string) => {
    if (name === 'react-native')
      return { Platform: { OS: 'ios' }, NativeModules: { MixpanelReactNative: native } }
    if (name === './package.json')
      return JSON.parse(readFileSync(require.resolve('mixpanel-react-native/package.json'), 'utf8'))
    if (name.endsWith('mixpanel-logger')) return { MixpanelLogger: {} }
    if (name.endsWith('mixpanel-main')) return { default: class {} }
    throw new Error(`Unexpected Mixpanel dependency: ${name}`)
  }
  new Function('require', 'module', 'exports', compiled)(dependency, module, module.exports)
  const client = new module.exports.Mixpanel('test-token', false)
  const operations = [
    ['track', () => client.track('Test Event', {})],
    ['identify', () => client.identify('test-account')],
    ['reset', () => client.reset()],
    ['registerSuperProperties', () => client.registerSuperProperties({ entitled: false })],
    ['set', () => client.getPeople().set({ onboarded: true })],
    ['deleteUser', () => client.getPeople().deleteUser()],
    ['flush', () => client.flush()],
  ] as const
  for (const [method, invoke] of operations) {
    let release!: () => void
    native[method].mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    const pending = invoke()
    expect(pending).toBeInstanceOf(Promise)
    let finished = false
    void pending.then(() => {
      finished = true
    })
    await Promise.resolve()
    expect(finished).toBe(false)
    release()
    await pending
    native[method].mockRejectedValueOnce(new Error('native failure'))
    await expect(invoke()).rejects.toThrow('native failure')
  }
})
