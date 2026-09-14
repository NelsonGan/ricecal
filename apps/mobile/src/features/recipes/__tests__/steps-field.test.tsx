import '@/i18n'
import type { ReactElement } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { fireEvent, render, screen, userEvent } from '@/test-utils'
import { StepsField } from '../StepsField'

const user = userEvent.setup()
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}
const mount = (field: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={METRICS}>{field}</SafeAreaProvider>)

it('uses one short add action when there are no cooking instructions', async () => {
  await mount(<StepsField value="" onChange={jest.fn()} />)

  expect(screen.getByRole('button', { name: 'Add cooking instructions' })).toBeOnTheScreen()
  expect(screen.queryByText(/One step on each line/)).toBeNull()
  expect(screen.queryByText(/Each new line/)).toBeNull()
})

it('builds numbered rows and saves them as newline-delimited text', async () => {
  const onChange = jest.fn()
  await mount(<StepsField value="" onChange={onChange} />)

  await user.press(screen.getByRole('button', { name: 'Add cooking instructions' }))
  await fireEvent.changeText(await screen.findByLabelText('Step 1'), 'Toast the spices.')

  await user.press(screen.getByRole('button', { name: 'Add step' }))
  await fireEvent.changeText(await screen.findByLabelText('Step 2'), 'Add the stock.')

  await user.press(screen.getByRole('button', { name: 'Remove step 1' }))
  expect(screen.getByLabelText('Step 1')).toHaveDisplayValue('Add the stock.')

  await user.press(screen.getByRole('button', { name: 'Done' }))
  expect(onChange).toHaveBeenCalledWith('Add the stock.')
})

it('keeps pasted newlines inside one step instead of creating hidden rows', async () => {
  const onChange = jest.fn()
  await mount(<StepsField value="" onChange={onChange} />)

  await user.press(screen.getByRole('button', { name: 'Add cooking instructions' }))
  await fireEvent.changeText(
    await screen.findByLabelText('Step 1'),
    'Toast the spices.\nKeep stirring.',
  )

  expect(screen.getByLabelText('Step 1')).toHaveDisplayValue('Toast the spices. Keep stirring.')
  expect(screen.queryByLabelText('Step 2')).toBeNull()

  await user.press(screen.getByRole('button', { name: 'Done' }))
  expect(onChange).toHaveBeenCalledWith('Toast the spices. Keep stirring.')
})

it('opens existing instructions as one editable row per displayed step', async () => {
  await mount(<StepsField value={'Boil the water.\nAdd the noodles.'} onChange={jest.fn()} />)

  await user.press(screen.getByRole('button', { name: /^Edit the steps/ }))

  expect(await screen.findByLabelText('Step 1')).toHaveDisplayValue('Boil the water.')
  expect(screen.getByLabelText('Step 2')).toHaveDisplayValue('Add the noodles.')
})
