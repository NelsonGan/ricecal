import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const stack = JSON.parse(
  execFileSync('pnpm', ['exec', 'supabase', 'status', '--workdir', `${root}apps`, '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
)
if (!/^http:\/\/(127\.0\.0\.1|localhost):54421\/?$/.test(stack.API_URL))
  throw new Error('Start the local RiceCal Supabase stack first.')
const envFile = new URL('../../apps/mobile/.env.local', import.meta.url)
const previous = await readFile(envFile, 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return null
  throw error
})
if (previous && !previous.includes('EXPO_PUBLIC_SCREENSHOT_MODE=true')) {
  await mkdir(new URL('../../.secrets/', import.meta.url), { recursive: true })
  await writeFile(
    new URL(`../../.secrets/mobile-env-before-screenshots-${Date.now()}`, import.meta.url),
    previous,
    { mode: 0o600 },
  )
}
const template = await readFile(new URL('../../apps/mobile/.env.example', import.meta.url), 'utf8')
const env = template
  .replace(/^EXPO_PUBLIC_SUPABASE_URL=.*$/m, `EXPO_PUBLIC_SUPABASE_URL=${stack.API_URL}`)
  .replace(/^EXPO_PUBLIC_SUPABASE_ANON_KEY=.*$/m, `EXPO_PUBLIC_SUPABASE_ANON_KEY=${stack.ANON_KEY}`)
await writeFile(
  envFile,
  `${env}\nEXPO_PUBLIC_GA4_ENABLED=false\nEXPO_PUBLIC_SCREENSHOT_MODE=true\n`,
  { mode: 0o600 },
)
console.log('Prepared the mobile env for local screenshot capture. Restart Metro with --clear.')
