import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { isStorableAmount, type RecipeInput, useSaveRecipe } from '../recipes'

// Each call records the table and the verb, and resolves to what the test set
// for that table and verb. Enough of the builder for `useSaveRecipe`.
const mockCalls: string[] = []
const mockAnswers: Record<string, { data: unknown; error: unknown }> = {}
jest.mock('@/lib/supabase', () => {
  const builder = (table: string, verb: string) => {
    mockCalls.push(`${verb} ${table}`)
    // A real promise with the builder's methods on it, so `await` lands on the
    // answer however many of them the caller chains.
    const chain = Promise.resolve(mockAnswers[`${verb} ${table}`] ?? { data: null, error: null })
    return Object.assign(chain, { select: () => chain, eq: () => chain, single: () => chain })
  }
  return {
    supabase: {
      from: (table: string) => ({
        insert: () => builder(table, 'insert'),
        update: () => builder(table, 'update'),
        delete: () => builder(table, 'delete'),
      }),
    },
  }
})
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../session', () => ({ useUserId: () => 'cook' }))
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))

const refused = { data: null, error: { message: 'violates check constraint', code: '23514' } }

const recipe = (id?: string): RecipeInput => ({
  id,
  name: 'Kari ayam',
  servings: 4,
  ingredients: [
    {
      name: 'Chicken',
      amount: 1000,
      unit: 'g',
      perUnit: { kcal: 2, carbs: 0, protein: 0.2, fat: 0.1 },
    },
  ],
})

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false, gcTime: 0 } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

beforeEach(() => {
  mockCalls.length = 0
  for (const key of Object.keys(mockAnswers)) delete mockAnswers[key]
  mockAnswers['insert recipes'] = { data: { id: 'new-recipe', is_public: false }, error: null }
  mockAnswers['update recipes'] = { data: { id: 'old-recipe', is_public: false }, error: null }
})

it('takes a new recipe back out when its ingredients are refused', async () => {
  mockAnswers['insert recipe_ingredients'] = refused
  const { client, wrapper } = setup()
  const { result, unmount } = await renderHook(useSaveRecipe, { wrapper })
  await act(async () => {
    await expect(result.current.mutateAsync(recipe())).rejects.toBeTruthy()
  })
  expect(mockCalls).toEqual(['insert recipes', 'insert recipe_ingredients', 'delete recipes'])
  await unmount()
  client.clear()
})

it('leaves an existing recipe in place when its ingredients are refused', async () => {
  mockAnswers['insert recipe_ingredients'] = refused
  const { client, wrapper } = setup()
  const { result, unmount } = await renderHook(useSaveRecipe, { wrapper })
  await act(async () => {
    await expect(result.current.mutateAsync(recipe('old-recipe'))).rejects.toBeTruthy()
  })
  expect(mockCalls).toEqual([
    'update recipes',
    'delete recipe_ingredients',
    'insert recipe_ingredients',
  ])
  await unmount()
  client.clear()
})

it('keeps a new recipe whose ingredients were written', async () => {
  const { client, wrapper } = setup()
  const { result, unmount } = await renderHook(useSaveRecipe, { wrapper })
  await act(async () => {
    await result.current.mutateAsync(recipe())
  })
  expect(mockCalls).toEqual(['insert recipes', 'insert recipe_ingredients'])
  await unmount()
  client.clear()
})

it('accepts only an amount the column can hold', () => {
  expect(isStorableAmount(0.01)).toBe(true)
  expect(isStorableAmount(250)).toBe(true)
  expect(isStorableAmount(100_000)).toBe(true)
  // Rounds to 0.00, which the check refuses.
  expect(isStorableAmount(0.004)).toBe(false)
  expect(isStorableAmount(0)).toBe(false)
  expect(isStorableAmount(100_001)).toBe(false)
  expect(isStorableAmount(Number.NaN)).toBe(false)
})
