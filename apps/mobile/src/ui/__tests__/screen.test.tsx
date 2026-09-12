import { SafeAreaProvider } from 'react-native-safe-area-context'

import { render, screen, within } from '../../test-utils'
import { AppBar } from '../AppBar'
import { Screen } from '../Screen'
import { Text } from '../Text'

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

describe('Screen header', () => {
  it('keeps page chrome outside the scroll view', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <Screen
          testID="page-body"
          header={<AppBar title="Preferences" onBack={() => {}} backLabel="Go back" />}
        >
          <Text>Scrollable settings</Text>
        </Screen>
      </SafeAreaProvider>,
    )

    const body = screen.getByTestId('page-body')
    expect(screen.getByText('Preferences')).toBeOnTheScreen()
    expect(within(body).queryByText('Preferences')).toBeNull()
    expect(within(body).getByText('Scrollable settings')).toBeOnTheScreen()
  })
})
