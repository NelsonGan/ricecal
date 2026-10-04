import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'

import { keys } from '../keys'
import { useSaveRecipe } from '../recipes'

const mockFrom = jest.fn()
const mockTrack = jest.fn()
jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}))
jest.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => mockTrack(...args) }))
jest.mock('../session', () => ({ useUserId: () => 'cook' }))
jest.mock('../subscription', () => ({ useEntitlement: () => ({ entitled: true, loading: false }) }))
jest.mock('../photos', () => ({ removeMealPhoto: jest.fn() }))
jest.mock('expo-router', () => ({ router: {} }))

it.each([undefined, 'recipe-id'])(
  'refreshes the food and quota without refetching logged snapshots (id %s)',
  async (id) => {
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const related = [
      keys.recipes('cook', 'mine', ''),
      keys.recipeCount('cook'),
      keys.recipe('recipe-id'),
      keys.recipeIngredients('recipe-id'),
    ]
    const snapshots = [
      keys.day('cook', '2026-10-01'),
      keys.dayMarks('cook', '2026-09-28', '2026-10-04'),
      keys.trendSeries('cook', '7d'),
      keys.trendSummary('cook', '7d'),
    ]
    for (const key of [...related, ...snapshots]) client.setQueryData(key, { saved: true })

    mockFrom.mockImplementation((table: string) => {
      const response = {
        data: table === 'recipes' ? { id: 'recipe-id', is_public: false } : [],
        error: null,
      }
      return Object.assign(Promise.resolve(response), {
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(response),
      })
    })
    const { result, unmount } = await renderHook(() => useSaveRecipe(), { wrapper })
    try {
      await act(async () => {
        await result.current.mutateAsync({
          id,
          name: 'Lunch',
          servings: 2,
          ingredients: [
            {
              name: 'Rice',
              amount: 100,
              unit: 'g',
              perUnit: { kcal: 1, carbs: 0.2, protein: 0, fat: 0 },
            },
          ],
        })
      })
      for (const key of related) expect(client.getQueryState(key)?.isInvalidated).toBe(true)
      for (const key of snapshots) {
        expect(client.getQueryState(key)?.isInvalidated).toBe(false)
        expect(client.getQueryData(key)).toEqual({ saved: true })
      }
      expect(mockTrack).toHaveBeenLastCalledWith('Recipe Saved', {
        is_new: !id,
        ingredients: 1,
        servings: 2,
      })
    } finally {
      await unmount()
      client.clear()
    }
  },
)
