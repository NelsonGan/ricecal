import { execFileSync } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES, SHOTS } from './fixtures.mjs'
import { captureSet, pngInfo, requireReady, sha256 } from './safety.mjs'

const args = process.argv.slice(2)
const option = (key, fallback) => {
  const index = args.indexOf(key)
  return index >= 0 ? args[index + 1] : fallback
}
const device = option('--device')
const port = Number(option('--port', '8082'))
const outputPath = option('--output')
if (!outputPath)
  throw new Error('Pass --output <screenshots-creator/public/assets/screenshots-iphone>.')
const output = resolve(outputPath)
const locales = option('--locale') ? option('--locale').split(',') : Object.keys(LOCALES)
if (!device || !Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Pass --device <screenshot simulator UUID> and optionally --port <Metro port>.')
if (!locales.length || new Set(locales).size !== locales.length)
  throw new Error('Choose each screenshot locale once.')
for (const locale of locales) if (!LOCALES[locale]) throw new Error(`Unsupported locale ${locale}`)
const state = JSON.parse(
  await readFile(new URL('../../.secrets/screenshots.json', import.meta.url), 'utf8'),
)
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())
const manifest = await readFile(new URL('./photos.json', import.meta.url))
const photos = JSON.parse(manifest)
const manifestHash = sha256(manifest)
const fixtureHash = sha256(await readFile(new URL('./fixtures.mjs', import.meta.url)))
for (const locale of locales)
  requireReady(
    state.accounts[locale],
    today,
    fixtureHash,
    photos.filter((photo) => photo.market === LOCALES[locale].market),
    manifestHash,
  )
const devices = JSON.parse(
  execFileSync('xcrun', ['simctl', 'list', 'devices', '--json'], { encoding: 'utf8' }),
)
const target = Object.values(devices.devices)
  .flat()
  .find((d) => d.udid === device)
if (target?.state !== 'Booted' || !target.name.startsWith('RiceCal Screenshots'))
  throw new Error(
    'Use a dedicated booted simulator named RiceCal Screenshots, to preserve other simulator sessions.',
  )
const argent = (tool, payload) => {
  const text = execFileSync('argent', ['run', tool, '--args', '-', '--json'], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  const result = JSON.parse(text)
  if (result.isError || result.error) throw new Error(`Argent ${tool} failed`)
  return result
}
const evaluate = (expression) =>
  argent('debugger-evaluate', { device_id: device, port, expression }).result
const wait = async (predicate, timeout = 30000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (predicate()) return
    await new Promise((done) => setTimeout(done, 500))
  }
  throw new Error('Screenshot state did not settle in time.')
}
const debuggerInfo = argent('debugger-connect', { device_id: device, port })
const expectedRoot = fileURLToPath(new URL('../../apps/mobile', import.meta.url))
if (debuggerInfo.projectRoot !== expectedRoot)
  throw new Error('Metro is serving a different checkout. Start Metro from this seeder branch.')
evaluate(
  `globalThis.shotFind=(key)=>{for(const [id,m] of __r.getModules()){if(m.isInitialized&&Object.prototype.hasOwnProperty.call(m.publicModule.exports??{},key))return m.publicModule.exports}throw Error('Missing module '+key)}; 'Capture helpers ready'`,
)
const backend = evaluate(`shotFind('supabase').supabase.supabaseUrl`)
if (!/^http:\/\/(127\.0\.0\.1|localhost):54421\/?$/.test(backend))
  throw new Error('The simulator must use local Supabase on port 54421.')
if (!evaluate(`shotFind('screenshotMode').screenshotMode`))
  throw new Error('Restart Metro with the screenshot env so Health sync cannot erase the fixtures.')
evaluate(
  `shotFind('requireNativeModule').requireNativeModule('DevMenuPreferences').setPreferencesAsync({showFloatingActionButton:false}); 'Developer button hidden'`,
)
execFileSync('xcrun', ['simctl', 'ui', device, 'appearance', 'light'])
execFileSync('xcrun', [
  'simctl',
  'status_bar',
  device,
  'override',
  '--time',
  '9:41',
  '--dataNetwork',
  'wifi',
  '--wifiMode',
  'active',
  '--wifiBars',
  '3',
  '--batteryState',
  'charged',
  '--batteryLevel',
  '100',
])
const captured = await captureSet(output, manifest, async (stage) => {
  const records = []
  for (const locale of locales) {
    const account = state.accounts[locale]
    if (!account.feedReady || account.feedPostIds?.length !== 6)
      throw new Error(`Reseed social feed for ${locale}`)
    evaluate(
      `globalThis.shotAuth={done:false}; shotFind('supabase').supabase.auth.signOut({scope:'local'}).then(({error})=>{shotAuth={done:true,error:error?.message}}).catch(()=>{shotAuth={done:true,error:'Sign-out failed'}}); 'Signing out'`,
    )
    await wait(() => evaluate('shotAuth.done'))
    if (evaluate('Boolean(shotAuth.error)')) throw new Error('Local fixture sign-out failed.')
    // The tutorial flag belongs to this installation, rather than the seeded database.
    evaluate(
      `shotFind('createMMKV').createMMKV({id:'ricecal-tutorial'}).set(${JSON.stringify(`offered:${account.id}`)},true); 'Tour already offered'`,
    )
    evaluate(
      `shotFind('setLanguage').setLanguage(${JSON.stringify(locale)}); globalThis.shotAuth={done:false}; shotFind('supabase').supabase.auth.signInWithPassword(${JSON.stringify({ email: account.email, password: account.password })}).then(({data,error})=>{shotAuth={done:true,userId:data.user?.id,error:error?.message}}).catch(()=>{shotAuth={done:true,error:'Sign-in failed'}}); 'Signing into screenshot account'`,
    )
    await wait(() => evaluate('shotAuth.done'))
    const auth = evaluate('shotAuth')
    if (auth.error || auth.userId !== account.id)
      throw new Error(`Local fixture login failed for ${locale}.`)
    if (evaluate(`shotFind('currentLanguage').currentLanguage()`) !== locale)
      throw new Error('The app language did not change.')
    await mkdir(resolve(stage, locale), { recursive: true })
    for (const [name, route] of SHOTS) {
      const destination = name === '03-dish' ? `/log/food/entry?entryId=${account.heroId}` : route
      evaluate(
        `shotFind('router').router.${['01-today', '04-trends', '05-feed'].includes(name) ? 'navigate' : 'replace'}(${JSON.stringify(destination)}); 'Opening screen'`,
      )
      await wait(
        () =>
          evaluate(`shotFind('store').store.getRouteInfo().pathname`) === destination.split('?')[0],
      )
      await new Promise((done) => setTimeout(done, 1500))
      await wait(() => evaluate(`shotFind('queryClient').queryClient.isFetching() === 0`))
      if (name === '02-describe') {
        // Use the screen's real input callback, then blur it for an uncluttered capture.
        // This changes only the draft, never submits it to the model.
        evaluate(
          `globalThis.shotInput=false;const hook=globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;for(const root of hook.getFiberRoots(1)){const visit=(f)=>{if(!f)return;if(f.memoizedProps?.maxLength===500&&f.memoizedProps?.onChangeText){f.memoizedProps.onChangeText(${JSON.stringify(LOCALES[locale].describe)});shotInput=true;}visit(f.child);visit(f.sibling)};visit(root.current)};shotFind('Keyboard').Keyboard.dismiss();shotInput`,
        )
        if (!evaluate('shotInput')) throw new Error('The describe input was not found.')
        await new Promise((done) => setTimeout(done, 700))
      }
      // Wait for images, card animations and native sheets after queries have finished.
      await new Promise((done) => setTimeout(done, 1500))
      evaluate(
        `const hook=globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;for(const renderer of hook.renderers.keys()){for(const root of hook.getFiberRoots(renderer)){const visit=(f)=>{if(!f)return;const p=f.memoizedProps;if(p?.value?.toast&&typeof p.value.dismiss==='function')p.value.dismiss();visit(f.child);visit(f.sibling)};visit(root.current)}};'Transient notices dismissed'`,
      )
      await new Promise((done) => setTimeout(done, 400))
      if (evaluate(`shotFind('currentLanguage').currentLanguage()`) !== locale)
        throw new Error('The app language changed during capture.')
      const activeQueries = evaluate(
        `shotFind('queryClient').queryClient.getQueryCache().getAll().filter(q=>q.isActive()).map(q=>({status:q.state.status,fetchStatus:q.state.fetchStatus}))`,
      )
      if (
        !activeQueries.length ||
        activeQueries.some((q) => q.status !== 'success' || q.fetchStatus !== 'idle')
      )
        throw new Error(`The ${locale}/${name} screen has missing or failed data.`)
      const path = resolve(stage, locale, `${name}.png`)
      execFileSync('xcrun', ['simctl', 'io', device, 'screenshot', path], {
        stdio: ['ignore', 'ignore', 'pipe'],
      })
      const header = await readFile(path)
      const record = {
        locale,
        screen: name,
        route: destination.split('?')[0],
        market: LOCALES[locale].market,
        date: account.date,
        appVersion: JSON.parse(
          await readFile(new URL('../../apps/mobile/package.json', import.meta.url)),
        ).version,
        appSourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: expectedRoot,
          encoding: 'utf8',
        }).trim(),
        fixtureSha256: fixtureHash,
        routeVerified: true,
        device: target.name,
        ...pngInfo(header),
        photoManifestSha256: manifestHash,
      }
      records.push(record)
      console.log(`${locale}/${name}.png`)
    }
  }
  return records
})
console.log(`Captured ${captured} screens in ${locales.length} app languages.`)
