const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/**
 * The exercise drawings as images in an asset catalog, named `exercise-<id>`,
 * for a target that cannot read the app's own: the watch app's rows and the
 * Live Activity's tile. The app's 320 px WebPs are 4.9 MB, and a row or a
 * tile needs a fraction of that: `sips`, which every Mac that builds for iOS
 * has, makes PNGs `px` on a side. A drawing already made from an unchanged
 * source at that size is kept, so only the first prebuild pays the few seconds.
 */
function writeExerciseArt(projectRoot, catalog, px) {
  const source = path.join(projectRoot, 'assets/exercises')
  fs.mkdirSync(catalog, { recursive: true })
  const contents = path.join(catalog, 'Contents.json')
  if (!fs.existsSync(contents)) {
    fs.writeFileSync(
      contents,
      `${JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
    )
  }
  for (const name of fs.readdirSync(source).filter((file) => file.endsWith('.webp'))) {
    const id = name.slice(0, -'.webp'.length)
    const set = path.join(catalog, `exercise-${id}.imageset`)
    const png = path.join(set, `${id}.png`)
    const from = path.join(source, name)
    fs.mkdirSync(set, { recursive: true })
    if (
      !fs.existsSync(png) ||
      fs.statSync(png).mtimeMs < fs.statSync(from).mtimeMs ||
      pixelWidth(png) !== px
    ) {
      execFileSync('sips', ['-s', 'format', 'png', '-Z', String(px), from, '--out', png], {
        stdio: 'ignore',
      })
    }
    fs.writeFileSync(
      path.join(set, 'Contents.json'),
      `${JSON.stringify(
        {
          images: [{ filename: `${id}.png`, idiom: 'universal' }],
          info: { author: 'xcode', version: 1 },
        },
        null,
        2,
      )}\n`,
    )
  }
}

/** A PNG's width, read from its header rather than by asking `sips` 278 times. */
function pixelWidth(png) {
  const header = Buffer.alloc(24)
  const fd = fs.openSync(png, 'r')
  try {
    fs.readSync(fd, header, 0, 24, 0)
  } finally {
    fs.closeSync(fd)
  }
  return header.readUInt32BE(16)
}

module.exports = { writeExerciseArt }
