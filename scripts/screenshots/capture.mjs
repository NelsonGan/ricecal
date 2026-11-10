import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIVE_WORKOUT, LOCALES, SHOTS } from './fixtures.mjs'
import { captureSet, FORMS, pngInfo, requireReady, sha256 } from './safety.mjs'

const args = process.argv.slice(2)
const option = (key, fallback) => {
  const index = args.indexOf(key)
  return index >= 0 ? args[index + 1] : fallback
}
const device = option('--udid')
const agentDevice = option('--agent-device')
const targetFilter = option('--target')
const port = Number(option('--port', '8082'))
const outputPath = option('--output')
if (!outputPath)
  throw new Error(
    'Pass --output <apps/app-studio/public/assets/screenshots-iphone>, or screenshots-iphone-duo on iPhone Duo.',
  )
const output = resolve(outputPath)
const locales = option('--locale') ? option('--locale').split(',') : Object.keys(LOCALES)
if (!device || !agentDevice || !Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error(
    'Pass --udid <simlock-udid of the leased simulator>, --agent-device <the command device_open returned> and --port <Metro port>.',
  )
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
// The service key reorders fixture posts; it is read from the local stack only.
const stack = JSON.parse(
  execFileSync(
    'pnpm',
    [
      'exec',
      'supabase',
      'status',
      '--workdir',
      fileURLToPath(new URL('../../apps', import.meta.url)),
      '-o',
      'json',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ),
)
if (!/^http:\/\/(127\.0\.0\.1|localhost):54421\/?$/.test(stack.API_URL))
  throw new Error('Start the local RiceCal Supabase stack first.')
// Discover is everyone's newest public posts. Just before a language's Feed is
// captured, its own unfollowed cook goes to the top of it, and every other
// language's goes back a week, where seeding left them.
const reorder = async (ids, minutesAgo) => {
  const createdAt = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString()
  const response = await fetch(
    `${new URL(stack.API_URL).origin}/rest/v1/social_posts?id=in.(${ids.join(',')})`,
    {
      method: 'PATCH',
      headers: {
        apikey: stack.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${stack.SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ created_at: createdAt, published_at: createdAt }),
    },
  )
  if (!response.ok || (await response.json()).length !== ids.length)
    throw new Error('The Discover fixture posts could not be ordered.')
}
const discoverFirst = async (account) => {
  const others = Object.values(state.accounts)
    .filter((other) => other !== account)
    .flatMap((other) => other.discoverPostIds ?? [])
  if (others.length) await reorder(others, 7 * 24 * 60)
  for (const [index, id] of account.discoverPostIds.entries())
    await reorder([id], [25, 35, 50][index])
}
// Devices are leased from the Simlock pool, which keeps its simulators in its
// own device set.
const SIMLOCK_SET = resolve(homedir(), '.simlock/devices/ios')
const simctl = (...rest) =>
  execFileSync('xcrun', ['simctl', '--set', SIMLOCK_SET, ...rest], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
const devices = JSON.parse(simctl('list', 'devices', '--json'))
const target = Object.values(devices.devices)
  .flat()
  .find((d) => d.udid === device)
if (target?.state !== 'Booted')
  throw new Error('Pass the UDID of a booted Simlock lease (simlock-udid <device id>).')
// iPhone Duo is captured open, where the app shows its side tab rail and two panes.
const form = target.deviceTypeIdentifier.endsWith('.iPhone-Duo') ? FORMS.duo : FORMS.iphone
const run = (command, rest) =>
  execFileSync(command, rest, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
  })
// iPhone shots come from agent-device at the panel's own density. agent-device
// cannot capture or fold an iPhone Duo in Simlock's device set (CoreDevice does
// not see it), so the Duo's lit inner display (simctl display 3, already
// landscape, 2853 x 2007) is taken with simctl.
const shoot = (path) => {
  if (form === FORMS.duo) simctl('io', device, 'screenshot', '--display=3', path)
  else run(agentDevice, ['screenshot', path, '--pixel-density', '3'])
}
if (form === FORMS.duo) {
  // agent-device's own fold helper, sent to the simulator with simctl spawn.
  const pkg = execFileSync(
    'bash',
    ['-c', 'ls -d ~/.t3/tools/agent-device/*/node_modules/agent-device | tail -1'],
    {
      encoding: 'utf8',
    },
  ).trim()
  const helper = resolve(tmpdir(), 'ricecal-fold-helper')
  run('xcrun', [
    '--sdk',
    'iphonesimulator',
    'clang',
    '-mios-simulator-version-min=15.0',
    '-fobjc-arc',
    '-framework',
    'Foundation',
    '-framework',
    'IOKit',
    resolve(pkg, 'apple/fold-helper/Fold.m'),
    '-o',
    helper,
  ])
  simctl('spawn', device, helper, 'open')
  await new Promise((done) => setTimeout(done, 3000))
}
// Expo Router 58 keeps no route store; the path is read off the navigation state.
const currentPath = `shotFind('getRouteInfoFromState').getRouteInfoFromState(shotFind('navigationRef').navigationRef.getRootState()).pathname`
// Metro's inspector, reached directly: it accepts a debugger socket that sends
// an Origin header.
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const candidates = targets.filter(
  (t) =>
    (t.description ?? '').includes('Bridgeless') &&
    (t.title ?? '').includes('com.nelsongan.ricecal') &&
    (!targetFilter || (t.deviceName ?? '').includes(targetFilter)),
)
if (candidates.length !== 1)
  throw new Error(
    `Expected one RiceCal debugger target on Metro ${port}, found ${candidates.length}. ` +
      'With two devices on one Metro, pass --target <part of its deviceName from /json/list>.',
  )
const socket = new WebSocket(candidates[0].webSocketDebuggerUrl, {
  headers: { Origin: `http://127.0.0.1:${port}` },
})
await new Promise((done, fail) => {
  socket.onopen = done
  socket.onerror = () => fail(new Error('Could not open the app debugger.'))
})
let messageId = 0
const pending = new Map()
socket.onmessage = (event) => {
  const message = JSON.parse(event.data)
  pending.get(message.id)?.(message)
  pending.delete(message.id)
}
const evaluate = async (expression) => {
  messageId += 1
  const id = messageId
  const message = await new Promise((done, fail) => {
    const timer = setTimeout(
      () => fail(new Error(`Debugger timed out: ${expression.slice(0, 60)}`)),
      20000,
    )
    pending.set(id, (reply) => {
      clearTimeout(timer)
      done(reply)
    })
    socket.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true },
      }),
    )
  })
  if (message.result?.exceptionDetails)
    throw new Error(
      message.result.exceptionDetails.exception?.description ?? 'Debugger evaluation failed',
    )
  return message.result?.result?.value
}
const wait = async (predicate, timeout = 30000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await predicate()) return
    await new Promise((done) => setTimeout(done, 500))
  }
  throw new Error('Screenshot state did not settle in time.')
}
const expectedRoot = fileURLToPath(new URL('../../apps/mobile', import.meta.url))
await evaluate(
  `globalThis.shotFind=(key)=>{for(const [id,m] of __r.getModules()){if(m.isInitialized&&Object.prototype.hasOwnProperty.call(m.publicModule.exports??{},key))return m.publicModule.exports}throw Error('Missing module '+key)}; 'Capture helpers ready'`,
)
const backend = await evaluate(`shotFind('supabase').supabase.supabaseUrl`)
if (!/^http:\/\/(127\.0\.0\.1|localhost):54421\/?$/.test(backend))
  throw new Error('The simulator must use local Supabase on port 54421.')
if (!(await evaluate(`shotFind('screenshotMode').screenshotMode`)))
  throw new Error('Restart Metro with the screenshot env so Health sync cannot erase the fixtures.')
await evaluate(
  `shotFind('requireNativeModule').requireNativeModule('DevMenuPreferences').setPreferencesAsync({showFloatingActionButton:false}); 'Developer button hidden'`,
)
run(agentDevice, ['settings', 'appearance', 'light'])
simctl(
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
)
const captured = await captureSet(
  output,
  manifest,
  async (stage) => {
    const records = []
    for (const locale of locales) {
      const account = state.accounts[locale]
      if (
        !account.feedReady ||
        account.feedPostIds?.length !== 6 ||
        account.discoverPostIds?.length !== 3
      )
        throw new Error(`Reseed social feed for ${locale}`)
      await evaluate(
        `globalThis.shotAuth={done:false}; shotFind('supabase').supabase.auth.signOut({scope:'local'}).then(({error})=>{shotAuth={done:true,error:error?.message}}).catch(()=>{shotAuth={done:true,error:'Sign-out failed'}}); 'Signing out'`,
      )
      await wait(async () => await evaluate('shotAuth.done'))
      if (await evaluate('Boolean(shotAuth.error)'))
        throw new Error('Local fixture sign-out failed.')
      // The tutorial flag belongs to this installation, rather than the seeded database.
      await evaluate(
        `shotFind('createMMKV').createMMKV({id:'ricecal-tutorial'}).set(${JSON.stringify(`offered:${account.id}`)},true); 'Tour already offered'`,
      )
      await evaluate(
        `shotFind('setLanguage').setLanguage(${JSON.stringify(locale)}); globalThis.shotAuth={done:false}; shotFind('supabase').supabase.auth.signInWithPassword(${JSON.stringify({ email: account.email, password: account.password })}).then(({data,error})=>{shotAuth={done:true,userId:data.user?.id,error:error?.message}}).catch(()=>{shotAuth={done:true,error:'Sign-in failed'}}); 'Signing into screenshot account'`,
      )
      await wait(async () => await evaluate('shotAuth.done'))
      const auth = await evaluate('shotAuth')
      if (auth.error || auth.userId !== account.id)
        throw new Error(`Local fixture login failed for ${locale}.`)
      if ((await evaluate(`shotFind('currentLanguage').currentLanguage()`)) !== locale)
        throw new Error('The app language did not change.')
      await mkdir(resolve(stage, locale), { recursive: true })
      // The running workout floats over every tab, so its logger is captured last.
      const order = [
        ...SHOTS.filter(([n]) => n !== '02-workout'),
        ...SHOTS.filter(([n]) => n === '02-workout'),
      ]
      const workoutId = randomUUID()
      // The live heart a paired Apple Watch streams. A reading lasts 20 seconds,
      // so it is sent again just before the capture.
      const pulse = `shotFind('receivePulse').receivePulse({workoutId:${JSON.stringify(workoutId)},bpm:132}); 'Pulse sent'`
      for (const [name, route] of order) {
        if (name === '02-workout') {
          // Written through the app's own store, as starting a workout does. The
          // name is the app's own for a morning start, in this language.
          const startedAt = Date.now() - 38 * 60 * 1000
          let tick = startedAt
          const exercises = LIVE_WORKOUT.map((exercise, e) => ({
            key: `shot-${e}`,
            exerciseId: exercise.exerciseId,
            name: exercise.name,
            tracking: exercise.tracking,
            restS: null,
            superset: null,
            notes: '',
            sets: exercise.sets.map((set, i) => {
              if (set.done) tick += 4 * 60 * 1000
              return {
                id: `shot-${e}-${i}`,
                kind: set.kind,
                weightKg: set.weightKg,
                reps: set.reps,
                durationS: null,
                distanceM: null,
                rpe: null,
                done: set.done,
                doneAt: set.done ? tick : null,
              }
            }),
          }))
          await evaluate(
            `shotFind('startActiveWorkout').startActiveWorkout(${JSON.stringify(account.id)},{id:${JSON.stringify(workoutId)},name:shotFind('setLanguage').default.t('workouts:start.morning'),notes:'',startedAt:${startedAt},endedAt:null,routineId:null,exercises:${JSON.stringify(exercises)},rest:null,healthWorkoutId:null}); 'Workout started'`,
          )
        }
        if (name === '05-feed') {
          await discoverFirst(account)
          // Anything cached from before the reorder is fetched again on the way in.
          await evaluate(
            `shotFind('queryClient').queryClient.invalidateQueries(); 'Queries invalidated'`,
          )
        }
        const destination = name === '03-dish' ? `/log/food/entry?entryId=${account.heroId}` : route
        await evaluate(
          `shotFind('router').router.${['01-today', '04-trends', '05-feed'].includes(name) ? 'navigate' : 'replace'}(${JSON.stringify(destination)}); 'Opening screen'`,
        )
        await wait(async () => (await evaluate(currentPath)) === destination.split('?')[0])
        await new Promise((done) => setTimeout(done, 1500))
        await wait(
          async () => await evaluate(`shotFind('queryClient').queryClient.isFetching() === 0`),
        )
        // Wait for images, card animations and native sheets after queries have finished.
        await new Promise((done) => setTimeout(done, 1500))
        await evaluate(
          `const hook=globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;for(const renderer of hook.renderers.keys()){for(const root of hook.getFiberRoots(renderer)){const visit=(f)=>{if(!f)return;const p=f.memoizedProps;if(p?.value?.toast&&typeof p.value.dismiss==='function')p.value.dismiss();visit(f.child);visit(f.sibling)};visit(root.current)}};'Transient notices dismissed'`,
        )
        if (name === '02-workout') await evaluate(pulse)
        await new Promise((done) => setTimeout(done, 400))
        if ((await evaluate(`shotFind('currentLanguage').currentLanguage()`)) !== locale)
          throw new Error('The app language changed during capture.')
        const activeQueries = await evaluate(
          `shotFind('queryClient').queryClient.getQueryCache().getAll().filter(q=>q.isActive()).map(q=>({status:q.state.status,fetchStatus:q.state.fetchStatus}))`,
        )
        if (
          !activeQueries.length ||
          activeQueries.some((q) => q.status !== 'success' || q.fetchStatus !== 'idle')
        )
          throw new Error(`The ${locale}/${name} screen has missing or failed data.`)
        const path = resolve(stage, locale, `${name}.png`)
        shoot(path)
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
          ...pngInfo(header, form),
          photoManifestSha256: manifestHash,
        }
        records.push(record)
        if (name === '02-workout') {
          await evaluate(
            `shotFind('clearActiveWorkout').clearActiveWorkout(${JSON.stringify(account.id)}); 'Workout cleared'`,
          )
          // Leave the logger before the next account signs in.
          await evaluate(`shotFind('router').router.replace('/today'); 'Back to Today'`)
          await new Promise((done) => setTimeout(done, 1000))
        }
        console.log(`${locale}/${name}.png`)
      }
    }
    return records.sort((a, b) =>
      `${a.locale}/${a.screen}`.localeCompare(`${b.locale}/${b.screen}`),
    )
  },
  form,
)
console.log(`Captured ${captured} screens in ${locales.length} app languages.`)
