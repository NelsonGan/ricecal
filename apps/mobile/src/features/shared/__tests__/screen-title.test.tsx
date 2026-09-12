import { View } from 'react-native'

import { render, screen } from '@/test-utils'
import { ScreenTitle } from '../ScreenTitle'

it('keeps a root title left aligned beside its controls', async () => {
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

  expect(screen.getByText('My foods')).toHaveProp('className', expect.stringContaining('text-left'))
})
