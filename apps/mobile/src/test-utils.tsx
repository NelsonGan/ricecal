import { render as rntlRender } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'

import { ThemeProvider } from './theme/ThemeProvider'

/**
 * Test helpers. Deliberately outside `__tests__` so Jest does not try to run
 * this file as a suite.
 */

function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}

/**
 * `render` with the design system's providers already in place.
 *
 * Components read colours through `useTheme`, which throws without a provider
 * rather than silently falling back to light — so every component test needs
 * this, and forgetting it should be a one-line fix rather than a puzzle.
 *
 * Async, like the RNTL v14 `render` it wraps.
 */
export function render(ui: ReactElement) {
  return rntlRender(ui, { wrapper: Providers })
}

export { act, fireEvent, screen, userEvent, waitFor, within } from '@testing-library/react-native'
