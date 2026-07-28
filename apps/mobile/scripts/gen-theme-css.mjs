#!/usr/bin/env node
/**
 * Regenerates the CSS custom properties in `global.css` from `src/theme/tokens.ts`.
 *
 * Tailwind needs the palette as static CSS at build time, but imperative code
 * (Skia, charts, StatusBar) needs it as TypeScript. Rather than maintain two
 * lists by hand, tokens.ts is the source and this script projects it into CSS.
 *
 *   node scripts/gen-theme-css.mjs          # write
 *   node scripts/gen-theme-css.mjs --check  # exit 1 if global.css is stale
 *
 * The parse is deliberately dumb — a regex over `key: '#RRGGBB',` lines inside
 * the `const light`/`const dark` blocks — because a real TS loader would drag
 * a transpiler into a script that runs in CI.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const TOKENS = join(here, '..', 'src', 'theme', 'tokens.ts')
const CSS = join(here, '..', 'global.css')

const START = '/* --- generated from src/theme/tokens.ts; run pnpm theme:gen --- */'
const END = '/* --- end generated --- */'

/** Pull one `const <name> = { ... } as const` block out of the tokens source. */
function block(source, name) {
  const open = source.indexOf(`const ${name} = {`)
  if (open === -1) throw new Error(`tokens.ts has no \`const ${name}\` block`)
  const close = source.indexOf('} as const', open)
  return source.slice(open, close)
}

/** `{ canvas: '#F6F8F7' }` -> `{ canvas: '246 248 247' }` */
function toChannels(body) {
  const out = {}
  for (const [, key, hex] of body.matchAll(/^\s*(\w+):\s*'(#[0-9A-F]{6})',/gm)) {
    const n = Number.parseInt(hex.slice(1), 16)
    out[key] = `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
  }
  return out
}

/** camelCase -> kebab-case, so `pandanSoftLine` becomes `--color-pandan-soft-line`. */
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

const source = readFileSync(TOKENS, 'utf8')
const modes = {
  light: toChannels(block(source, 'light')),
  dark: toChannels(block(source, 'dark')),
}

const lightKeys = Object.keys(modes.light)
const darkKeys = Object.keys(modes.dark)
const missing = lightKeys.filter((k) => !darkKeys.includes(k))
const extra = darkKeys.filter((k) => !lightKeys.includes(k))
if (missing.length || extra.length) {
  console.error(
    `tokens.ts light/dark mismatch — dark missing: [${missing}], dark extra: [${extra}]`,
  )
  process.exit(1)
}

const vars = (mode, indent) =>
  lightKeys.map((k) => `${indent}--color-${kebab(k)}: ${modes[mode][k]};`).join('\n')

// Light only. NativeWind has no dark-scoped stylesheet root — a `.dark:root`
// block compiles and is then never referenced — so the dark palette is applied
// at runtime by src/theme/ThemeProvider.tsx via `vars()`. What stays here is
// the fallback for anything rendered above that provider.
//
// The dark values are still validated: the light/dark key check above runs on
// every generation, and the drift test compares this block to tokens.ts.
const generated = `${START}
  :root {
${vars('light', '    ')}
  }
  ${END}`

const current = readFileSync(CSS, 'utf8')
const startAt = current.indexOf(START)
const endAt = current.indexOf(END)
if (startAt === -1 || endAt === -1) {
  console.error(`global.css is missing the ${START} / ${END} markers`)
  process.exit(1)
}
const next = current.slice(0, startAt) + generated + current.slice(endAt + END.length)

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('global.css is out of date. Run: pnpm --filter @ricecal/mobile theme:gen')
    process.exit(1)
  }
  console.log(`global.css is up to date (${lightKeys.length} roles)`)
} else {
  writeFileSync(CSS, next)
  console.log(`global.css updated (${lightKeys.length} roles)`)
}
