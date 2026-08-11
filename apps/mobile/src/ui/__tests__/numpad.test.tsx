import { useState } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { fireEvent, render, screen, userEvent, waitFor } from '../../test-utils'
import { NumpadHost, NumpadProvider } from '../Numpad'
import { Text } from '../Text'
import { TextField } from '../TextField'

/**
 * The pad exists because the system one could no longer be laid out against,
 * so what is worth pinning here is the part a device would not tell you about
 * quickly: that the keys write what they should, and that the system keyboard
 * is actually suppressed. The look of it is a gallery job.
 */

const user = userEvent.setup()

const LABELS = { done: 'Done', backspace: 'Delete the last digit', decimal: 'Decimal point' }

/** The pad's height ends at the home indicator, so it needs real insets. */
const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

function Harness({
  label = 'Amount',
  initial = '',
  keyboardType = 'decimal-pad' as const,
  selectTextOnFocus = false,
}: {
  label?: string
  initial?: string
  keyboardType?: 'decimal-pad' | 'number-pad' | 'numeric' | 'default'
  selectTextOnFocus?: boolean
}) {
  const [value, setValue] = useState(initial)
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <NumpadProvider labels={LABELS}>
        <NumpadHost>
          <TextField
            label={label}
            value={value}
            onChangeText={setValue}
            keyboardType={keyboardType}
            selectTextOnFocus={selectTextOnFocus}
          />
        </NumpadHost>
      </NumpadProvider>
    </SafeAreaProvider>
  )
}

/**
 * Focus, then wait for the pad.
 *
 * The wait is not incidental: the provider promotes the session to the thing a
 * host draws in an effect, so that it can hold the pad on screen through the
 * close animation. A test that reads the tree on the focus tick sees the field
 * and nothing else.
 */
async function openPad(label = 'Amount') {
  const field = screen.getByLabelText(label)
  fireEvent(field, 'focus')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy())
  return field
}

async function tap(name: string) {
  await user.press(screen.getByRole('button', { name }))
}

describe('Numpad', () => {
  it('stays shut until a numeric field is focused, and names the field when it opens', async () => {
    await render(<Harness label="Servings" />)
    expect(screen.queryByRole('button', { name: '7' })).toBeNull()

    await openPad('Servings')
    expect(screen.getByRole('button', { name: '7' })).toBeTruthy()
    // The header, which is the only thing left saying what the digits are for
    // once the pad covers the field.
    expect(screen.getAllByText('Servings').length).toBeGreaterThan(0)
  })

  /**
   * The reason the pad reads its field through a ref. Closed over the value it
   * opened with, the second digit would replace the first rather than follow
   * it, and every figure in the app would be one character long.
   */
  it('appends digit after digit', async () => {
    await render(<Harness />)
    const field = await openPad()
    await tap('1')
    await tap('2')
    await tap('5')
    expect(field.props.value).toBe('125')
  })

  it('does not leave a leading zero in front of a digit', async () => {
    await render(<Harness />)
    const field = await openPad()
    await tap('0')
    expect(field.props.value).toBe('0')
    await tap('3')
    expect(field.props.value).toBe('3')
  })

  it('offers one decimal point, and only to a field that takes one', async () => {
    await render(<Harness />)
    const field = await openPad()
    await tap('1')
    await tap('Decimal point')
    await tap('5')
    await tap('Decimal point')
    expect(field.props.value).toBe('1.5')
  })

  it('blanks the decimal key on a whole-number field', async () => {
    await render(<Harness keyboardType="number-pad" />)
    await openPad()
    expect(screen.queryByRole('button', { name: 'Decimal point' })).toBeNull()
    // The row is still three keys wide, so 0 stays where the thumb expects it.
    expect(screen.getByRole('button', { name: '0' })).toBeTruthy()
  })

  it('rubs out the last digit', async () => {
    await render(<Harness initial="240" />)
    const field = await openPad()
    await tap('Delete the last digit')
    expect(field.props.value).toBe('24')
  })

  /**
   * `selectTextOnFocus` used to mean "typing replaces what is there". With no
   * keyboard there is no typing, so the pad has to reproduce it: the first key
   * of an edit stands in for the whole value, and a first rub-out clears it.
   */
  it('lets the first key stand in for a selected value', async () => {
    await render(<Harness initial="240" selectTextOnFocus />)
    const field = await openPad()
    await tap('9')
    expect(field.props.value).toBe('9')
    await tap('0')
    expect(field.props.value).toBe('90')
  })

  it('clears a selected value on the first rub-out', async () => {
    await render(<Harness initial="240" selectTextOnFocus />)
    const field = await openPad()
    await tap('Delete the last digit')
    expect(field.props.value).toBe('')
  })

  /**
   * The whole point of the exercise. With the system keyboard suppressed there
   * is no number pad, so there is no floating "Done" pill inflating the
   * keyboard frame, so nothing is laid out against a control it cannot see.
   */
  it('suppresses the system keyboard on a numeric field', async () => {
    await render(<Harness />)
    expect(screen.getByLabelText('Amount').props.showSoftInputOnFocus).toBe(false)
  })

  // All three of React Native's numeric types, because the set they are checked
  // against is the only thing deciding which fields lose the system keyboard.
  // Side by side in one render rather than one after another: `rerender` and
  // `unmount` both leave RNTL's `screen` pointing at nothing, and every test
  // after the one that called them fails on an empty tree.
  it('takes every keyboard type that means a number', async () => {
    function Every() {
      const [value, setValue] = useState('')
      return (
        <SafeAreaProvider initialMetrics={METRICS}>
          <NumpadProvider labels={LABELS}>
            <NumpadHost>
              {(['decimal-pad', 'number-pad', 'numeric'] as const).map((keyboardType) => (
                <TextField
                  key={keyboardType}
                  label={keyboardType}
                  value={value}
                  onChangeText={setValue}
                  keyboardType={keyboardType}
                />
              ))}
            </NumpadHost>
          </NumpadProvider>
        </SafeAreaProvider>
      )
    }
    await render(<Every />)
    for (const keyboardType of ['decimal-pad', 'number-pad', 'numeric']) {
      expect(screen.getByLabelText(keyboardType).props.showSoftInputOnFocus).toBe(false)
    }
  })

  it('leaves a field that is not a number alone', async () => {
    await render(<Harness keyboardType="default" />)
    expect(screen.getByLabelText('Amount').props.showSoftInputOnFocus).toBe(true)
    fireEvent(screen.getByLabelText('Amount'), 'focus')
    expect(screen.queryByRole('button', { name: '7' })).toBeNull()
  })

  it('takes the pad away when the edit is done', async () => {
    await render(<Harness />)
    await openPad()
    await tap('Done')
    // The button asks the field to blur, and the blur is what closes the pad —
    // the same route tapping away from a keyboard takes.
    fireEvent(screen.getByLabelText('Amount'), 'blur')
    await waitFor(() => expect(screen.queryByRole('button', { name: '7' })).toBeNull())
  })

  /**
   * The calorie total on a logged entry swaps its input back for a heading the
   * moment the edit ends, and an unmount fires no blur. Left open, the pad
   * would go on driving a field that is no longer on screen.
   */
  it('closes when the field it is driving unmounts', async () => {
    function Vanishing() {
      const [value, setValue] = useState('')
      const [editing, setEditing] = useState(true)
      return (
        <SafeAreaProvider initialMetrics={METRICS}>
          <NumpadProvider labels={LABELS}>
            <NumpadHost>
              {editing ? (
                <TextField
                  label="Amount"
                  value={value}
                  onChangeText={setValue}
                  keyboardType="decimal-pad"
                />
              ) : null}
              <Text onPress={() => setEditing(false)}>Stop</Text>
            </NumpadHost>
          </NumpadProvider>
        </SafeAreaProvider>
      )
    }
    await render(<Vanishing />)
    await openPad()
    await user.press(screen.getByText('Stop'))
    await waitFor(() => expect(screen.queryByRole('button', { name: '7' })).toBeNull())
  })

  /**
   * A field with no host above it has nowhere to draw a pad. It keeps the
   * system keyboard rather than focusing into nothing.
   */
  it('leaves a field outside a host on the system keyboard', async () => {
    function Loose() {
      const [value, setValue] = useState('')
      return (
        <SafeAreaProvider initialMetrics={METRICS}>
          <NumpadProvider labels={LABELS}>
            <TextField
              label="Amount"
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
            />
          </NumpadProvider>
        </SafeAreaProvider>
      )
    }
    await render(<Loose />)
    expect(screen.getByLabelText('Amount').props.showSoftInputOnFocus).toBe(true)
    fireEvent(screen.getByLabelText('Amount'), 'focus')
    expect(screen.queryByRole('button', { name: '7' })).toBeNull()
  })
})
