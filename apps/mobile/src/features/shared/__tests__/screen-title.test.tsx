import { View } from 'react-native'

import { act, render, screen } from '@/test-utils'
import { ScreenTitle } from '../ScreenTitle'

it('reserves the wider control width on both sides of a root title', async () => {
  await render(
    <ScreenTitle
      title="My foods"
      leading={<View />}
      trailing={
        <View>
          <View />
          <View />
        </View>
      }
    />,
  )

  await act(() => {
    screen.getByTestId('screen-title-leading-measure').props.onLayout({
      nativeEvent: { layout: { width: 44 } },
    })
    screen.getByTestId('screen-title-trailing-measure').props.onLayout({
      nativeEvent: { layout: { width: 96 } },
    })
  })

  expect(screen.getByTestId('screen-title-leading-slot')).toHaveStyle({ minWidth: 96 })
  expect(screen.getByTestId('screen-title-trailing-slot')).toHaveStyle({ minWidth: 96 })
})
