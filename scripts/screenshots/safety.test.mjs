import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { captureSet, pngInfo, requireReady, sha256, writeJson } from './safety.mjs'

const png = (value = 0) => {
  const bytes = Buffer.alloc(25)
  bytes.set(Buffer.from('89504e470d0a1a0a', 'hex'))
  bytes.writeUInt32BE(1320, 16)
  bytes.writeUInt32BE(2868, 20)
  bytes[24] = value
  return bytes
}
const inTemp = async (fn) => {
  const root = await mkdtemp(resolve(tmpdir(), 'ricecal-capture-test-'))
  try {
    await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
const staged = async (stage, locale, manifest, value) => {
  const bytes = png(value)
  await mkdir(resolve(stage, locale), { recursive: true })
  await writeFile(resolve(stage, locale, '01-today.png'), bytes)
  return [{ locale, screen: '01-today', ...pngInfo(bytes), photoManifestSha256: sha256(manifest) }]
}

test('same-day interrupted seeds and changed photos cannot be captured', () => {
  const photo = { filename: 'my-1.jpg', sha256: 'photo-hash' }
  const account = {
    ready: true,
    heroId: 'hero',
    date: '2026-10-02',
    fixtureSha256: 'fixtures',
    photoManifestSha256: 'manifest',
    photos: { 'my-1.jpg': 'local-key' },
    photoHashes: { 'my-1.jpg': photo.sha256 },
  }
  const check = (a = account, date = account.date, fixture = 'fixtures', photos = [photo]) =>
    requireReady(a, date, fixture, photos, 'manifest')
  assert.doesNotThrow(() => check())
  assert.throws(() => check({ ...account, ready: false }), /Reseed/)
  assert.throws(() => check(account, '2026-10-03'), /Reseed/)
  assert.throws(() => check(account, account.date, 'changed-fixtures'), /changed/)
  assert.throws(
    () => check(account, account.date, 'fixtures', [{ ...photo, sha256: 'new' }]),
    /images/,
  )
})

test('a failed capture preserves the reviewed images and metadata', () =>
  inTemp(async (output) => {
    const manifest = Buffer.from('[]\n')
    await captureSet(output, manifest, (stage) => staged(stage, 'en', manifest, 1))
    const before = await readFile(resolve(output, 'capture.json'))
    await assert.rejects(
      captureSet(output, manifest, async (stage) => {
        await staged(stage, 'en', manifest, 2)
        throw new Error('A screen failed')
      }),
      /screen failed/,
    )
    assert.deepEqual(await readFile(resolve(output, 'en/01-today.png')), png(1))
    assert.deepEqual(await readFile(resolve(output, 'capture.json')), before)
  }))

test('a partial recapture cannot relabel old food provenance or changed files', () =>
  inTemp(async (output) => {
    const manifest = Buffer.from('[]\n')
    await captureSet(output, manifest, (stage) => staged(stage, 'en', manifest, 1))
    await assert.rejects(
      captureSet(output, Buffer.from('[1]\n'), (stage) =>
        staged(stage, 'ja', Buffer.from('[1]\n'), 2),
      ),
      /Recapture every locale/,
    )
    await writeFile(resolve(output, 'en/01-today.png'), png(3))
    await assert.rejects(
      captureSet(output, manifest, (stage) => staged(stage, 'ja', manifest, 2)),
      /differs from its capture record/,
    )
  }))

test('a valid partial recapture retains other locales and checks the PNG size', () =>
  inTemp(async (output) => {
    const manifest = Buffer.from('[]\n')
    await captureSet(output, manifest, (stage) => staged(stage, 'en', manifest, 1))
    await captureSet(output, manifest, (stage) => staged(stage, 'ja', manifest, 2))
    const result = JSON.parse(await readFile(resolve(output, 'capture.json'), 'utf8'))
    assert.deepEqual(
      result.captures.map((record) => record.locale),
      ['en', 'ja'],
    )
    const wrongSize = png()
    wrongSize.writeUInt32BE(1290, 16)
    assert.throws(() => pngInfo(wrongSize), /1320/)
    assert.throws(() => pngInfo(Buffer.alloc(8)), /1320/)
  }))

test('credential writes replace stale file permissions and complete JSON atomically', () =>
  inTemp(async (output) => {
    const file = resolve(output, 'secrets.json')
    await writeFile(file, '{}', { mode: 0o644 })
    await writeJson(file, { ready: false }, 0o600)
    assert.equal((await stat(file)).mode & 0o777, 0o600)
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { ready: false })
  }))

test('duplicate screen pixels cannot replace a reviewed set', () =>
  inTemp(async (output) => {
    const manifest = Buffer.from('[]\n')
    await captureSet(output, manifest, (stage) => staged(stage, 'en', manifest, 1))
    const before = await readFile(resolve(output, 'capture.json'))
    await assert.rejects(
      captureSet(output, manifest, async (stage) => {
        const records = await staged(stage, 'en', manifest, 2)
        await writeFile(resolve(stage, 'en/05-feed.png'), png(2))
        return [...records, { ...records[0], screen: '05-feed' }]
      }),
      /Duplicate screenshot pixels/,
    )
    assert.deepEqual(await readFile(resolve(output, 'capture.json')), before)
    assert.deepEqual(await readFile(resolve(output, 'en/01-today.png')), png(1))
  }))
