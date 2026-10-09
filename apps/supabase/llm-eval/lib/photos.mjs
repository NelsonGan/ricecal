/**
 * The photographs the photo cases are about, fetched once and kept.
 *
 * A case names a URL (its citation; the Wikimedia Commons ones are CC-licensed)
 * or a file under `apps/supabase/data/`, and the bytes land in a gitignored
 * cache. Checking somebody else's photographs into the repo to grade a model is
 * a poor trade, and some cases are somebody's actual lunch.
 *
 * Every image is sent as a JPEG no wider than 1280 px, because that is what the
 * app uploads and the vision call labels everything `image/jpeg`. `sips` does
 * the conversion on macOS; elsewhere the bytes go as they are.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const CACHE = fileURLToPath(new URL('../.cache/photos/', import.meta.url))
const DATA = fileURLToPath(new URL('../../data/', import.meta.url))

export class MissingPhoto extends Error {}

const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  )

async function source(spec) {
  if (spec.file) {
    const path = `${DATA}${spec.file}`
    if (!(await exists(path))) throw new MissingPhoto(`${spec.file} is not on this machine`)
    return readFile(path)
  }
  // Wikimedia answers a burst of thumbnail requests with 429, and the first run
  // fetches every photo at once. Waiting is cheaper than a harness error.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(spec.url, {
      headers: { 'User-Agent': 'ricecal-llm-eval/1.0 (https://ricecal.app)' },
    })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    await res.body?.cancel()
    if (res.status !== 429 || attempt >= 6)
      throw new Error(`could not fetch ${spec.url}: ${res.status}`)
    await new Promise((resolve) => setTimeout(resolve, 5000 * 2 ** attempt))
  }
}

/** One download at a time, so concurrent cases do not set off the rate limit. */
let queue = Promise.resolve()
const serially = (fn) => {
  const next = queue.then(fn, fn)
  queue = next.catch(() => {})
  return next
}

/**
 * Loads in flight, by photo. Several tasks share a photo, and two cases loading
 * it at once on a cold cache would both run `sips` into the same file while one
 * of them reads it: a half-written JPEG sent to the model and the judge.
 */
const pending = new Map()

/** `{ base64, mediaType }` for one photo spec (`{ url }` or `{ file }`). */
export function loadPhoto(spec) {
  const id = createHash('sha1')
    .update(spec.url ?? spec.file)
    .digest('hex')
    .slice(0, 16)
  if (!pending.has(id)) {
    const load = cache(id, spec)
    pending.set(id, load)
    // A failure is not remembered, so the next case can try again.
    load.catch(() => pending.delete(id))
  }
  return pending.get(id)
}

async function cache(id, spec) {
  await mkdir(CACHE, { recursive: true })
  const ready = `${CACHE}${id}.jpg`
  if (!(await exists(ready))) {
    const raw = `${CACHE}${id}.src`
    await writeFile(raw, await serially(() => source(spec)))
    try {
      execFileSync('sips', ['-s', 'format', 'jpeg', '-Z', '1280', raw, '--out', ready], {
        stdio: 'ignore',
      })
    } catch {
      await writeFile(ready, await readFile(raw))
    }
  }
  return { base64: (await readFile(ready)).toString('base64'), mediaType: 'image/jpeg' }
}
