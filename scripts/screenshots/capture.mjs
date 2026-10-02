import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES, SHOTS } from './fixtures.mjs'

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
if (!device || !Number.isInteger(port))
  throw new Error('Pass --device <screenshot simulator UUID> and optionally --port <Metro port>.')
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
  `globalThis.shotFind=(key)=>{for(const [id,m] of __r.getModules()){if(m.isInitialized&&m.publicModule.exports?.[key])return m.publicModule.exports}throw Error('Missing module '+key)}; 'Capture helpers ready'`,
)
const backend = evaluate(`shotFind('supabase').supabase.supabaseUrl`)
if (!/^http:\/\/(127\.0\.0\.1|localhost):54421\/?$/.test(backend))
  throw new Error('The simulator must use local Supabase on port 54421.')
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
const records = []
for (const locale of locales) {
  const account = state.accounts[locale]
  if (!account?.heroId) throw new Error(`Run the seeder for ${locale} first.`)
  if (account.date !== today) throw new Error(`Reseed ${locale} for today before capturing.`)
  evaluate(
    `globalThis.shotAuth={done:false}; shotFind('supabase').supabase.auth.signOut({scope:'local'}).then(()=>{shotAuth={done:true}}); 'Signing out'`,
  )
  await wait(() => evaluate('shotAuth.done'))
  // The tutorial flag belongs to this installation, rather than the seeded database.
  evaluate(
    `shotFind('createMMKV').createMMKV({id:'ricecal-tutorial'}).set(${JSON.stringify(`offered:${account.id}`)},true); 'Tour already offered'`,
  )
  evaluate(
    `shotFind('setLanguage').setLanguage(${JSON.stringify(locale)}); globalThis.shotAuth={done:false}; shotFind('supabase').supabase.auth.signInWithPassword(${JSON.stringify({ email: account.email, password: account.password })}).then(({data,error})=>{shotAuth={done:true,userId:data.user?.id,error:error?.message}}); 'Signing into screenshot account'`,
  )
  await wait(() => evaluate('shotAuth.done'))
  const auth = evaluate('shotAuth')
  if (auth.error || auth.userId !== account.id)
    throw new Error(`Local fixture login failed for ${locale}.`)
  if (evaluate(`shotFind('currentLanguage').currentLanguage()`) !== locale)
    throw new Error('The app language did not change.')
  await mkdir(resolve(output, locale), { recursive: true })
  for (const [name, route] of SHOTS) {
    const destination = name === '03-dish' ? `/log/food/entry?entryId=${account.heroId}` : route
    evaluate(`shotFind('router').router.replace(${JSON.stringify(destination)}); 'Opening screen'`)
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
    const path = resolve(output, locale, `${name}.png`)
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
      device: target.name,
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
    }
    records.push(record)
    console.log(`${locale}/${name}.png`)
  }
}
const metadata = resolve(output, 'capture.json')
const previous = await readFile(metadata, 'utf8')
  .then(JSON.parse)
  .catch((error) => {
    if (error.code === 'ENOENT') return { captures: [] }
    throw error
  })
const replaced = new Set(records.map((record) => `${record.locale}/${record.screen}`))
const captures = [
  ...previous.captures.filter((record) => !replaced.has(`${record.locale}/${record.screen}`)),
  ...records,
]
await writeFile(
  metadata,
  `${JSON.stringify({ backend: 'local Supabase', platform: 'iOS simulator', foodImages: 'AI-generated', captures }, null, 2)}\n`,
)
await writeFile(
  resolve(output, 'photo-provenance.json'),
  await readFile(new URL('./photos.json', import.meta.url)),
)
console.log(`Captured ${records.length} screens in ${locales.length} app languages.`)
