import '@/i18n'
import { render, screen, userEvent } from '@/test-utils'
import { NewRecipeChooser } from '../NewRecipeChooser'

const user = userEvent.setup()

it('offers manual entry before the two AI inputs', async () => {
  const onManual = jest.fn()
  const onPhoto = jest.fn()
  const onDescribe = jest.fn()

  await render(<NewRecipeChooser onManual={onManual} onPhoto={onPhoto} onDescribe={onDescribe} />)

  expect(screen.getByText('Use AI')).toBeOnTheScreen()
  await user.press(screen.getByRole('button', { name: 'Fill it in myself' }))
  await user.press(screen.getByRole('button', { name: 'Photo' }))
  await user.press(screen.getByRole('button', { name: 'Describe' }))

  expect(onManual).toHaveBeenCalledTimes(1)
  expect(onPhoto).toHaveBeenCalledTimes(1)
  expect(onDescribe).toHaveBeenCalledTimes(1)
})
