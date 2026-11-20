import { renderHook } from '@testing-library/react-native'
import '@/i18n'
import { useMeasureText } from '../useMeasureText'

// i18next's English rules make every count but exactly 1 plural, which wrote
// "¾ cups" on the food page and in recipes.
it('keeps a fraction of one unit singular, and more than one plural', async () => {
  const { result } = await renderHook(() => useMeasureText())
  expect(result.current.amount(0.75, 'cup')).toBe('¾ cup')
  expect(result.current.amount(1, 'cup')).toBe('1 cup')
  expect(result.current.amount(1.5, 'cup')).toBe('1½ cups')
  expect(result.current.unit('cup', 0.5)).toBe('cup')
  expect(result.current.unit('tbsp', 2)).toBe('tbsp')
})
