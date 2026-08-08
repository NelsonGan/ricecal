import '@/i18n'
import { render, screen, userEvent } from '@/test-utils'
import { DescribePanel } from '../DescribePanel'

/**
 * The third way to log a meal: typing it.
 *
 * What is worth pinning here is the contract with the host, because the host
 * writes a row and closes the sheet on the strength of it. An empty box must
 * not be sendable — a meal described as "" resolves to the archetype floor and
 * puts 600 kcal on the day — and what comes out has to be trimmed, since the
 * server slices to 500 characters and a leading space is a wasted one.
 *
 * The multiline field is the other half of it, and it is deliberate: a meal is
 * "nasi lemak with fried chicken and a teh tarik", and a one-line box that
 * scrolls sideways teaches people to type "nasi lemak" and stop.
 *
 * Queried by ROLE AND NAME rather than by label. The send control used to be an
 * arrow inside the field carrying "Log this meal" as its accessibility label,
 * and is a full-width button wearing those words now — the role query holds
 * across both, and it is the one that describes what a user is looking for.
 */

const onSubmit = jest.fn()
const user = userEvent.setup()

beforeEach(() => onSubmit.mockClear())

it('will not send an empty box', async () => {
  await render(<DescribePanel onSubmit={onSubmit} />)

  const send = screen.getByRole('button', { name: 'Log this meal' })
  expect(send).toBeDisabled()

  await user.press(send)
  expect(onSubmit).not.toHaveBeenCalled()
})

it('sends the meal, trimmed', async () => {
  await render(<DescribePanel onSubmit={onSubmit} />)

  await user.type(
    screen.getByPlaceholderText('Nasi lemak with fried chicken and a teh tarik'),
    '  nasi lemak with fried chicken  ',
  )
  await user.press(screen.getByRole('button', { name: 'Log this meal' }))

  expect(onSubmit).toHaveBeenCalledWith('nasi lemak with fried chicken')
})

it('takes a whole meal on more than one line', async () => {
  await render(<DescribePanel onSubmit={onSubmit} />)

  const field = screen.getByPlaceholderText('Nasi lemak with fried chicken and a teh tarik')
  expect(field.props.multiline).toBe(true)
  // 500 is what `scan-meal` slices to; a field that lets more in only teaches
  // the user that the app lost the end of their sentence.
  expect(field.props.maxLength).toBe(500)
})
