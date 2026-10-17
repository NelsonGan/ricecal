import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export async function writeJson(file, value, mode) {
  const path = file instanceof URL ? fileURLToPath(file) : file
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

export function requireReady(account, date, fixtureHash, photos, manifestHash) {
  if (!account?.ready || !account.heroId || account.date !== date)
    throw new Error('Reseed this locale for today before capturing.')
  if (account.fixtureSha256 !== fixtureHash || account.photoManifestSha256 !== manifestHash)
    throw new Error('The fixtures or food images changed. Reseed before capturing.')
  for (const photo of photos) {
    if (!account.photos?.[photo.filename] || account.photoHashes?.[photo.filename] !== photo.sha256)
      throw new Error('The seeded food images do not match the current manifest.')
  }
}

export function pngInfo(bytes) {
  if (
    bytes.length < 24 ||
    bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.readUInt32BE(16) !== 1320 ||
    bytes.readUInt32BE(20) !== 2868
  )
    throw new Error('Capture requires a 1320 x 2868 iPhone screenshot.')
  return { width: 1320, height: 2868, sha256: sha256(bytes) }
}

// A failed capture never overwrites a previously reviewed set. File checksums
// also detect an interrupted publication before it can pass the creator's check.
export async function captureSet(output, manifest, capture) {
  await mkdir(output, { recursive: true })
  const stage = await mkdtemp(resolve(output, '.capture-'))
  try {
    const records = await capture(stage)
    if (!records.length) throw new Error('There are no captures to publish.')
    const previous = await readFile(resolve(output, 'capture.json'), 'utf8')
      .then(JSON.parse)
      .catch((error) => {
        if (error.code === 'ENOENT') return { captures: [] }
        throw error
      })
    if (new Set(records.map((record) => record.sha256)).size !== records.length)
      throw new Error('Duplicate screenshot pixels. Check the active route before capture.')
    const paths = new Set(records.map((record) => `${record.locale}/${record.screen}`))
    if (paths.size !== records.length) throw new Error('Duplicate capture records.')
    const retained = previous.captures.filter(
      (record) => !paths.has(`${record.locale}/${record.screen}`),
    )
    const manifestHash = sha256(manifest)
    for (const record of retained) {
      if (record.photoManifestSha256 !== manifestHash)
        throw new Error('Food provenance changed. Recapture every locale together.')
      const bytes = await readFile(resolve(output, record.locale, `${record.screen}.png`))
      if (sha256(bytes) !== record.sha256)
        throw new Error('An existing screenshot differs from its capture record.')
    }
    for (const record of records) {
      const bytes = await readFile(resolve(stage, record.locale, `${record.screen}.png`))
      if (pngInfo(bytes).sha256 !== record.sha256 || record.photoManifestSha256 !== manifestHash)
        throw new Error('Staged screenshot metadata does not match its files.')
    }
    for (const record of records) {
      const destination = resolve(output, record.locale, `${record.screen}.png`)
      await mkdir(dirname(destination), { recursive: true })
      await rename(resolve(stage, record.locale, `${record.screen}.png`), destination)
    }
    await writeFile(resolve(output, 'photo-provenance.json'), manifest)
    await writeJson(resolve(output, 'capture.json'), {
      backend: 'local Supabase',
      platform: 'iOS simulator',
      foodImages: 'AI-generated',
      captures: [...retained, ...records],
    })
    return records.length
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}
