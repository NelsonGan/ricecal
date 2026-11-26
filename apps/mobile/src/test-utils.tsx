import { render as rntlRender } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { ThemeProvider } from './theme/ThemeProvider'

/**
 * Test helpers. Deliberately outside `__tests__` so Jest does not try to run
 * this file as a suite.
 */

/**
 * A phone with no insets, so a screen that asks how wide its window is and
 * what iOS keeps at its sides (`useWindowLayout`) gets the phone's answer
 * rather than an error. A test of another device wraps its own provider.
 */
const PHONE_METRICS = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={PHONE_METRICS}>
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  )
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
