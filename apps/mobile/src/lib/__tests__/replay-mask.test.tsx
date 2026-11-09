import { Text } from 'react-native'

import { render, screen } from '../../test-utils'
import { ReplayMask } from '../replay-mask'

it('marks its wrapper the way PostHog recorders mask, and keeps it in the native tree', async () => {
  await render(
    <ReplayMask testID="mask" style={{ flex: 1 }}>
      <Text>72 kg</Text>
    </ReplayMask>,
  )
  const mask = screen.getByTestId('mask')
  expect(mask.props.accessibilityLabel).toBe('ph-no-capture')
  // Flattened away, a layout-only view leaves nothing for the recorder to find.
  expect(mask.props.collapsable).toBe(false)
  // The label would otherwise stand in for the children on TalkBack.
  expect(mask.props.importantForAccessibility).toBe('no')
  expect(mask.props.style).toEqual({ flex: 1 })
  // The reading is still there for everybody who is not a recorder.
  expect(screen.getByText('72 kg')).toBeTruthy()
})
