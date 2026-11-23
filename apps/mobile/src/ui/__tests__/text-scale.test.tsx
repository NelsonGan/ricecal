import { render, screen } from '../../test-utils'
import { Text } from '../Text'
import { TEXT_SCALES } from '../textScale'

/**
 * Text does not follow the phone's text size setting (`textScale.ts`).
 *
 * The switch only holds if every way text reaches the screen honours it, and
 * the way it breaks is quiet: a new `TextInput` without the prop, or a layout
 * reading `fontScale` straight off the window, works at the default size and
 * only goes wrong on a phone with large text, which nobody building it uses.
 * So the source is read for both.
 */

const fs = jest.requireActual<typeof import('node:fs')>('node:fs')
const path = jest.requireActual<typeof import('node:path')>('node:path')

const ROOTS = ['../../../src', '../../../app'].map((dir) => path.join(__dirname, dir))

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

const files = ROOTS.flatMap(sources).map((file) => ({
  file: path.relative(path.join(__dirname, '../../..'), file),
  text: fs.readFileSync(file, 'utf8') as string,
}))

it('is off', () => {
  expect(TEXT_SCALES).toBe(false)
})

it('reaches the design system’s Text, whatever the caller asks', async () => {
  await render(<Text allowFontScaling>Nasi lemak</Text>)
  expect(screen.getByText('Nasi lemak')).toHaveProp('allowFontScaling', false)
})

it('reaches every TextInput', () => {
  const missing = files.flatMap(({ file, text }) =>
    // The element's props up to its closing `>`, stepping over the `=>` of an
    // arrow-function prop, and only a JSX element: `useRef<TextInput>` is a type.
    [...text.matchAll(/<TextInput\s((?:=>|[^>])*?)\/?>/g)]
      .filter((match) => !match[1]?.includes('allowFontScaling={TEXT_SCALES}'))
      .map(() => file),
  )
  expect(missing).toEqual([])
})

it('leaves no layout reading the system text size directly', () => {
  const direct = files
    .filter(({ file }) => !file.endsWith('textScale.ts'))
    .filter(({ text }) =>
      /\bfontScale\b[^\n]*useWindowDimensions|\.fontScale\b|getFontScale\(/.test(text),
    )
    .map(({ file }) => file)
  expect(direct).toEqual([])
})
