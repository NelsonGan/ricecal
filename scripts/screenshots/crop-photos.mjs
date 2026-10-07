import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { MARKETS } from './fixtures.mjs'
import { promptFor } from './image-prompts.mjs'

const root = new URL('./', import.meta.url)
await mkdir(new URL('photos/', root), { recursive: true })
const photos = []
for (const [market, dishes] of Object.entries(MARKETS)) {
  const batch = `batches/${market.toLowerCase()}.png`
  const bytes = await readFile(new URL(batch, root))
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  // The Japanese sheet's row boundary is slightly above the nominal midpoint.
  const split = market === 'JP' ? 488 : height / 2
  for (const [index, dish] of dishes.entries()) {
    const column = index % 3
    const row = Math.floor(index / 3)
    const rowHeight = row === 0 ? split : height - split
    const size = Math.floor(Math.min(width / 3, rowHeight)) - 4
    const x = Math.floor((column * width) / 3 + (width / 3 - size) / 2)
    const y = Math.floor((row === 0 ? 0 : split) + (rowHeight - size) / 2)
    const filename = `${market.toLowerCase()}-${index + 1}.jpg`
    execFileSync(
      'sips',
      [
        '-c',
        `${size}`,
        `${size}`,
        '--cropOffset',
        `${y}`,
        `${x}`,
        '-s',
        'format',
        'jpeg',
        '-s',
        'formatOptions',
        '88',
        fileURLToPath(new URL(batch, root)),
        '-o',
        fileURLToPath(new URL(`photos/${filename}`, root)),
      ],
      { stdio: 'ignore' },
    )
    const photo = await readFile(new URL(`photos/${filename}`, root))
    photos.push({
      filename,
      dish: dish.name,
      market,
      origin: 'AI-generated',
      generator: 'OpenAI image_gen',
      batch,
      referenceBatch: market === 'MY' ? null : 'batches/my.png',
      prompt: promptFor(market),
      crop: { x, y, width: size, height: size },
      sha256: createHash('sha256').update(photo).digest('hex'),
    })
  }
}
await writeFile(new URL('photos.json', root), `${JSON.stringify(photos, null, 2)}\n`)
console.log(
  `Cropped ${photos.length} generated food photos from ${Object.keys(MARKETS).length} batches.`,
)
