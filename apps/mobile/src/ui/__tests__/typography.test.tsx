import { PixelRatio, StyleSheet } from 'react-native'

import { render, screen } from '../../test-utils'
import { Text } from '../Text'
import { TextScriptProvider } from '../TextScript'

/**
 * The line height, which is the one part of the ramp that is not a class.
 *
 * Worth pinning because the failure is silent and only visible in a language
 * the person changing the code probably does not read: a leading tuned for
 * Baloo 2's Latin shears the tops off 没有上限, and nothing throws. The bug
 * reached a user as "title slightly cut off in mandarin".
 *
 * Appearance is otherwise left to the gallery route on a device. These are
 * arithmetic.
 *
 * React Native's jest preset reports a font scale of 2. Pinned to 1 here so the
 * numbers below are the ramp's own; the scaling itself is the subject of the
 * last test.
 */
beforeEach(() => {
  jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1)
})

afterEach(() => {
  jest.restoreAllMocks()
})

const leadingOf = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) as { lineHeight?: number } | undefined)?.lineHeight

const renderIn = async (script: 'latin' | 'cjk' | 'tall', ui: React.ReactElement) => {
  await render(<TextScriptProvider script={script}>{ui}</TextScriptProvider>)
}

it('sets a Latin screen title in exactly the leading it was designed with', async () => {
  await renderIn('latin', <Text variant="screenTitle">Monday 17 Aug</Text>)

  // 26px type, 32px leading, straight off the ramp.
  expect(leadingOf(screen.getByText('Monday 17 Aug'))).toBe(32)
})

it('opens the same title up for a script whose glyphs fill the em box', async () => {
  await renderIn('cjk', <Text variant="screenTitle">8月17日 周一</Text>)

  // 26 x 1.36, because 32 is not enough room for 周.
  expect(leadingOf(screen.getByText('8月17日 周一'))).toBe(35)
})

it('gives stacked marks more room again', async () => {
  await renderIn('tall', <Text variant="screenTitle">17 ส.ค.</Text>)

  expect(leadingOf(screen.getByText('17 ส.ค.'))).toBe(39)
})

it('leaves prose alone in every script, because it already has the room', async () => {
  await renderIn('cjk', <Text variant="body">菜名会保持它被写下时的语言。</Text>)

  // `body` is 17px on 27px, which is 1.59x and already past the floor.
  expect(leadingOf(screen.getByText('菜名会保持它被写下时的语言。'))).toBe(27)
})

/**
 * Forty-odd callers size type against something measured — a ring, a stepper, a
 * share card — by passing their own pair. Reading the variant's leading over
 * the top of those would silently undo every one of them.
 */
it('keeps a leading the caller set for itself', async () => {
  await renderIn(
    'latin',
    <Text variant="numeric" className="text-[34px] leading-[42px]">
      1,847
    </Text>,
  )

  expect(leadingOf(screen.getByText('1,847'))).toBe(42)
})

it('still floors a caller-set pair for a script that needs more', async () => {
  await renderIn(
    'cjk',
    <Text variant="numeric" className="text-[34px] leading-[42px]">
      每天 2,710
    </Text>,
  )

  // 34 x 1.36 is 46, which beats the 42 the caller asked for.
  expect(leadingOf(screen.getByText('每天 2,710'))).toBe(46)
})

it('follows the reader up when they turn Dynamic Type on', async () => {
  jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.35)

  await renderIn('cjk', <Text variant="screenTitle">8月17日 周一</Text>)

  // The platform scaled the 26px type by 1.35 and left an absolute lineHeight
  // where it was, which is what cropped the glyphs. 35 x 1.35 keeps the ratio.
  expect(leadingOf(screen.getByText('8月17日 周一'))).toBe(48)
})

/**
 * `adjustsFontSizeToFit` beside an explicit `lineHeight` is a React Native bug
 * that shrinks text even when it fits. `StatTile` is the caller that depends on
 * this; its own test pins the symptom, and this pins the rule.
 */
it('gives a shrinking label no line height to fight', async () => {
  await renderIn(
    'cjk',
    <Text variant="displayMd" adjustsFontSizeToFit>
      1,530
    </Text>,
  )

  expect(leadingOf(screen.getByText('1,530'))).toBeUndefined()
})
