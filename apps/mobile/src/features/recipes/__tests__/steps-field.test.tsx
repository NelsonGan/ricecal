import '@/i18n'
import { render, screen } from '@/test-utils'
import { StepsField } from '../StepsField'

it('uses one short add action when there are no cooking instructions', async () => {
  await render(<StepsField value="" onChange={jest.fn()} />)

  expect(screen.getByRole('button', { name: 'Add cooking instructions' })).toBeOnTheScreen()
  expect(screen.queryByText(/One step on each line/)).toBeNull()
  expect(screen.queryByText(/Each new line/)).toBeNull()
})
