#!/usr/bin/env node
/**
 * Draws the exercise library's illustrations through Codex image generation.
 *
 *   node scripts/exercise-art/generate.mjs [--only id,id] [--force] [--jobs 6]
 *   uv run scripts/exercise-art/process.py
 *
 * A developer tool, like `sync-icons.mjs`: the processed images are committed,
 * so CI and EAS never run it. It writes raw 1254px PNGs into
 * `~/.cache/ricecal/exercise-art` (or `EXERCISE_ART_RAW`), outside the repo
 * because Metro watches the app folder and reloads on every file that lands
 * in it, and `process.py` turns them into the 320px WebPs the app ships.
 *
 * Every drawing is generated against `style-reference.png`, which is the first
 * one that came out right. A set drawn without a shared reference drifts into
 * five styles by the fortieth image; with it, the figure, palette and lighting
 * stay one family and only the movement changes.
 *
 * LOOK AT EVERY IMAGE before committing it. The pose brief is precise, but a
 * model can still swap a grip, add a limb or draw the wrong machine, and an
 * exercise library with a wrong picture is worse than one with none. Regenerate
 * a bad one with `--only <id> --force`.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { EXERCISES } from '../../src/features/workouts/catalogue.ts'
import { POSES } from './poses.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const APP = join(here, '..', '..')
const RAW = process.env.EXERCISE_ART_RAW ?? join(homedir(), '.cache', 'ricecal', 'exercise-art')
const REFERENCE = join(here, 'style-reference.png')
const CODEX_IMAGE = join(
  APP,
  '..',
  '..',
  '.agents',
  'skills',
  'codex-imagegen',
  'scripts',
  'codex-image.sh',
)

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
// A flag given without its value stops the run. Read as absent, `--only` with
// nothing after it queued every exercise, and `--jobs` with no number made no
// workers and reported "all drawn".
const option = (name) => {
  const at = args.indexOf(name)
  if (at === -1) return undefined
  const value = args[at + 1]
  if (value === undefined || value.startsWith('--')) {
    console.error(`${name} needs a value`)
    process.exit(1)
  }
  return value
}

const only = option('--only')?.split(',').filter(Boolean)
const force = flag('--force')
const jobs = Number(option('--jobs') ?? 6)
if (!Number.isInteger(jobs) || jobs < 1) {
  console.error('--jobs needs a whole number above zero')
  process.exit(1)
}
const unknown = only?.filter((id) => !EXERCISES.some((exercise) => exercise.id === id)) ?? []
if (unknown.length) {
  console.error(`No such exercise: ${unknown.join(', ')}`)
  process.exit(1)
}

const missing = EXERCISES.filter((exercise) => !POSES[exercise.id])
if (missing.length) {
  console.error(`No pose brief for: ${missing.map((exercise) => exercise.id).join(', ')}`)
  process.exit(1)
}

const queue = EXERCISES.filter((exercise) => {
  if (only && !only.includes(exercise.id)) return false
  return force || !existsSync(join(RAW, `${exercise.id}.png`))
})

mkdirSync(RAW, { recursive: true })
console.log(`${queue.length} to draw, ${jobs} at a time`)

function brief(exercise) {
  return `Asset type: exercise illustration for the exercise library of a gym workout logging app, shown from 48pt to 240pt. It must be technically accurate so a gym-goer instantly recognises the exact exercise: "${exercise.name}".
Subject: one figure ${POSES[exercise.id]}
Style/medium: match the reference image exactly: soft matte clay 3D render, smooth rounded forms, a featureless round bald head with no face, warm skin-tone clay body, a brown tank top and charcoal shorts exactly as in the reference (never another colour, so every figure in the library is the same person), light sneakers. Equipment in mid-grey and graphite clay with soft highlights, never pure black, so it reads on both light and dark backgrounds.
Composition/framing: the whole figure and all of the equipment fully visible, centered, filling about 85% of a square canvas, nothing cropped.
Lighting/mood: soft studio light from the top-left, gentle ambient occlusion.
Avoid: text, letters, numbers, labels, arrows, motion lines, watermark, background, floor plane, scenery beyond what the subject names, drop shadow, extra people.`
}

function draw(exercise) {
  return new Promise((resolve) => {
    const out = join(RAW, `${exercise.id}.png`)
    const child = spawn(CODEX_IMAGE, ['-o', out, '-t', '-i', REFERENCE, brief(exercise)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let err = ''
    child.stderr.on('data', (chunk) => {
      err += chunk
    })
    child.on('close', (code) => {
      if (code === 0) console.log(`drew ${exercise.id}`)
      else console.error(`FAILED ${exercise.id}: ${err.trim().split('\n').slice(-3).join(' | ')}`)
      resolve(code === 0)
    })
  })
}

let next = 0
let failed = 0
async function worker() {
  while (next < queue.length) {
    const exercise = queue[next++]
    if (!(await draw(exercise))) failed++
  }
}

await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, worker))
console.log(failed ? `${failed} failed` : 'all drawn')
process.exit(failed ? 1 : 0)
