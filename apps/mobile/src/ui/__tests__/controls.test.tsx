import { render, screen, userEvent } from '../../test-utils'
import { CountBadge } from '../Badge'
import { Button } from '../Button'
import { Chip } from '../Chip'
import { cn } from '../cn'
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
