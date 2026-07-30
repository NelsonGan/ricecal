import { impactAsync } from 'expo-haptics'
import { StyleSheet } from 'react-native'

import { render, screen, userEvent } from '../../test-utils'
import { CountBadge } from '../Badge'
import { NavItem } from '../BottomNav'
import { Button } from '../Button'
import { Chip } from '../Chip'
import { cn } from '../cn'
import { StatTile } from '../StatTile'
import { Stepper } from '../Stepper'
import { Switch } from '../Switch'
import { WaterTracker } from '../WeekStrip'

/**
 * Behaviour, not appearance.
 *
 * Styling is verified on a device through the gallery route, where the real
 * fonts and the real theme are involved. What is worth pinning here is the
 * logic a screen would otherwise re-derive and get subtly wrong: whether a
 * press fires, whether a value clamps, whether a control is honest about being
 * controlled.
 *
 * Two things about @testing-library/react-native v14 that cost real time:
 *
 * - `render` and every interaction are async. A missing `await` does not fail
 *   loudly; the next line reports "`render` function has not been called",
 *   which points nowhere near the cause.
 * - `userEvent`, not `fireEvent`. `fireEvent.press` walks up past the host tree
 *   and invokes the `onPress` prop of the composite component itself, so it
 *   reports a press even when nothing in the rendered output is pressable —
 *   which makes it useless for asserting that a disabled control did nothing.
 *
 * `render` comes from `src/test-utils`, which wraps the tree in ThemeProvider.
 */

const user = userEvent.setup()

describe('Button', () => {
  it('fires onPress', async () => {
    const onPress = jest.fn()
    await render(<Button onPress={onPress}>Add food</Button>)
    await user.press(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  // The reason `loading` exists: a mutation in flight must not be re-fired by
  // an impatient second tap.
  it('swallows presses while loading', async () => {
    const onPress = jest.fn()
    await render(
      <Button loading onPress={onPress}>
        Save
      </Button>,
    )
    await user.press(screen.getByRole('button'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('swallows presses while disabled', async () => {
    const onPress = jest.fn()
    await render(
      <Button disabled onPress={onPress}>
        Save
      </Button>,
    )
    await user.press(screen.getByRole('button'))
    expect(onPress).not.toHaveBeenCalled()
  })

  // An inert control still has to be announced. Dropping it from the
  // accessibility tree makes VoiceOver skip it in silence.
  it('stays in the accessibility tree while inert', async () => {
    await render(
      <Button loading onPress={() => {}}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toBeBusy()
  })
})

describe('Chip', () => {
  it('exposes its selected state', async () => {
    await render(
      <Chip selected onPress={() => {}}>
        Halal
      </Chip>,
    )
    expect(screen.getByRole('button')).toBeSelected()
  })

  it('is not a button when it has no handler', async () => {
    await render(<Chip soft>½ plate</Chip>)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('CountBadge', () => {
  it('renders nothing at zero', async () => {
    await render(<CountBadge count={0} />)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('caps at max with a plus', async () => {
    await render(<CountBadge count={128} max={99} />)
    expect(screen.getByText('99+')).toBeTruthy()
  })
})

describe('Stepper', () => {
  it('formats halves as vulgar fractions', async () => {
    await render(<Stepper value={1.5} onChange={() => {}} unit="plates" />)
    expect(screen.getByText('1½')).toBeTruthy()
  })

  it('formats a bare half without a leading zero', async () => {
    await render(<Stepper value={0.5} onChange={() => {}} />)
    expect(screen.getByText('½')).toBeTruthy()
  })

  it('falls back to a number for values that are not clean quarters', async () => {
    await render(<Stepper value={1.3} onChange={() => {}} />)
    expect(screen.getByText('1.3')).toBeTruthy()
  })

  /**
   * `editable` swaps the label for a field, which is a different node — text
   * against a display value. Worth pinning, because the plain stepper is in four
   * other screens and none of them should become a text input.
   */
  it('renders the value as a label unless it is editable', async () => {
    await render(<Stepper value={2} onChange={() => {}} />)

    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.queryByDisplayValue('2')).toBeNull()
  })

  it('renders the value as a field when it is editable', async () => {
    await render(<Stepper value={2} onChange={() => {}} editable editLabel="Type the amount" />)

    expect(screen.getByDisplayValue('2')).toBeTruthy()
  })

  /**
   * The steps cannot reach every amount — 0.35 of a tub is not a multiple of a
   * half — so the number itself is a field when a caller opts in. Focus empties
   * it, so what is typed IS the value, and `user.type` ends in a blur, which is
   * what commits.
   */
  it('takes an exact amount typed into it', async () => {
    const onChange = jest.fn()
    await render(<Stepper value={1} onChange={onChange} editable editLabel="Type the amount" />)

    await user.type(screen.getByLabelText('Type the amount'), '0.35')

    expect(onChange).toHaveBeenLastCalledWith(0.35)
  })

  it('clamps what was typed rather than accepting it', async () => {
    const onChange = jest.fn()
    await render(
      <Stepper value={1} max={10} onChange={onChange} editable editLabel="Type the amount" />,
    )

    await user.type(screen.getByLabelText('Type the amount'), '99')

    expect(onChange).toHaveBeenLastCalledWith(10)
  })

  /** A mistyped amount deleted back to nothing must not read as zero. */
  it('keeps the value it had when the field is left empty', async () => {
    const onChange = jest.fn()
    await render(
      <Stepper value={2} min={0.5} onChange={onChange} editable editLabel="Type the amount" />,
    )

    const field = screen.getByLabelText('Type the amount')
    // Focus empties the field; leaving without typing commits nothing.
    await user.type(field, '')

    expect(onChange).not.toHaveBeenCalled()
  })

  /** Without `editable` the number is not a control, and must not announce as one. */
  it('is not typeable unless asked', async () => {
    await render(<Stepper value={1} onChange={() => {}} />)
    expect(screen.queryByLabelText('Type the amount')).toBeNull()
  })

  it('stops at the floor', async () => {
    const onChange = jest.fn()
    await render(<Stepper value={0} min={0} onChange={onChange} />)
    await user.press(screen.getByLabelText('Decrease'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops at the ceiling', async () => {
    const onChange = jest.fn()
    await render(<Stepper value={10} max={10} onChange={onChange} />)
    await user.press(screen.getByLabelText('Increase'))
    expect(onChange).not.toHaveBeenCalled()
  })

  // 0.1 + 0.2 is 0.30000000000000004, and this number is rendered.
  it('does not leak floating point noise', async () => {
    const onChange = jest.fn()
    await render(<Stepper value={0.1} step={0.2} onChange={onChange} />)
    await user.press(screen.getByLabelText('Increase'))
    expect(onChange).toHaveBeenCalledWith(0.3)
  })
})

describe('Switch', () => {
  it('asks the caller to flip rather than flipping itself', async () => {
    const onValueChange = jest.fn()
    await render(
      <Switch value={false} onValueChange={onValueChange} accessibilityLabel="Reminders" />,
    )

    await user.press(screen.getByRole('switch'))

    expect(onValueChange).toHaveBeenCalledWith(true)
    // Still off: the parent owns the value, so a rejected write can roll back.
    expect(screen.getByRole('switch')).not.toBeChecked()
  })
})

describe('WaterTracker', () => {
  it('fills up to the tapped glass', async () => {
    const onChange = jest.fn()
    await render(<WaterTracker filled={2} goal={8} onChange={onChange} />)
    await user.press(screen.getByLabelText('Glass 5 of 8'))
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it('empties the last filled glass when it is tapped again', async () => {
    const onChange = jest.fn()
    await render(<WaterTracker filled={5} goal={8} onChange={onChange} />)
    await user.press(screen.getByLabelText('Glass 5 of 8'))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  /**
   * A goal past one row wraps, and the row is finished with blank cells so the
   * short second row keeps the columns of the first. Those cells are the thing
   * worth pinning: they are `View`s among pressables, and a stray one that became
   * reachable would read to a screen reader as a glass that does nothing.
   */
  it('renders every glass of a goal that wraps, and nothing extra', async () => {
    const onChange = jest.fn()
    await render(<WaterTracker filled={9} goal={12} onChange={onChange} />)

    expect(screen.getAllByRole('button')).toHaveLength(12)
    expect(screen.getByLabelText('Glass 12 of 12')).toBeOnTheScreen()

    // The last glass on the short row still fills to its own position rather than
    // to wherever it sits in the row.
    await user.press(screen.getByLabelText('Glass 11 of 12'))
    expect(onChange).toHaveBeenCalledWith(11)
  })
})

const flatten = (style: unknown): { lineHeight?: number } =>
  (StyleSheet.flatten(style as never) as { lineHeight?: number } | undefined) ?? {}

/**
 * Appearance is normally left to the gallery route on a device, so this one needs
 * a reason: `adjustsFontSizeToFit` next to an explicit `lineHeight` is a React
 * Native bug that shrinks text even when it fits, and it does not fail — it just
 * renders numbers too small to read, which is how it reached a user. There is
 * nothing to observe at runtime, so the combination itself is what gets pinned.
 */
describe('StatTile', () => {
  const renderValue = async (value: string) => {
    await render(<StatTile label="CARBS" value={value} />)
    return screen.getByText(value)
  }

  it('does not give the shrinking value a line height to fight', async () => {
    const node = await renderValue('182g')
    expect(node.props.adjustsFontSizeToFit).toBe(true)
    expect(flatten(node.props.style).lineHeight).toBeUndefined()
  })

  it('keeps the shrink shallow enough to stay legible', async () => {
    const node = await renderValue('1,530')
    expect(node.props.minimumFontScale).toBeGreaterThanOrEqual(0.8)
  })

  it('leaves the label alone, which is what lets it keep its line height', async () => {
    await render(<StatTile label="PROTEIN" value="104g" />)
    expect(screen.getByText('PROTEIN').props.adjustsFontSizeToFit).toBeFalsy()
  })

  it('reads the label and value together to a screen reader', async () => {
    await render(<StatTile label="CARBS" value="182g" />)
    expect(screen.getByLabelText('CARBS: 182g')).toBeOnTheScreen()
  })
})

/**
 * The tab bar is the one place in the app that renders a plain `Pressable`
 * rather than a `Squish`, so both of the things `Squish` gives every other
 * control — the haptic and the inactive treatment — had to be added by hand here,
 * and neither fails loudly when it regresses.
 */
describe('NavItem', () => {
  const tab = { label: 'Today', icon: { set: 'ui', name: 'home' } } as const

  it('answers a tap in the hand', async () => {
    await render(<NavItem {...tab} />)
    await user.press(screen.getByRole('tab'))
    // On press IN, like `Squish`: feedback that waits for the release lands
    // after the screen has already changed.
    expect(impactAsync).toHaveBeenCalled()
  })

  it('still tells the caller about the press', async () => {
    const onPress = jest.fn()
    await render(<NavItem {...tab} onPress={onPress} />)
    await user.press(screen.getByRole('tab'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('says which tab is the active one', async () => {
    await render(<NavItem {...tab} isFocused />)
    expect(screen.getByRole('tab')).toBeSelected()
  })

  /**
   * The inactive tint is NOT asserted here, deliberately. It reaches the icon
   * through `style`, and RNTL v14 dropped the type queries that could find a
   * decorative image inside the row — an icon with no accessibility label is
   * hidden from every query the library still has, which is correct of it. The
   * reasoning lives in `NavItem` instead; verify it in the gallery on a device.
   */
})

describe('cn', () => {
  // Without the tailwind-merge extension these custom scales are unknown class
  // groups, both survive, and which one paints is decided by stylesheet order.
  it('lets a later class win within our custom scales', () => {
    expect(cn('rounded-md', 'rounded-full')).toBe('rounded-full')
    expect(cn('font-body', 'font-display')).toBe('font-display')
    expect(cn('min-h-sm', 'min-h-lg')).toBe('min-h-lg')
  })

  it('keeps classes from different groups', () => {
    expect(cn('bg-pandan', 'text-on-pandan')).toBe('bg-pandan text-on-pandan')
  })
})
