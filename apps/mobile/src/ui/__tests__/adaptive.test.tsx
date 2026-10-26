import * as ReactNative from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { render, screen, within } from '../../test-utils'
import { overlayInsets, paneFrames, windowLayout } from '../adaptive'
import { Aside, splitPanes } from '../Aside'
import { Screen } from '../Screen'
import { Text } from '../Text'

// Points from the iPhone Duo simulator (iOS 27.1) and an iPhone 18 Pro.
const PHONE = { width: 402, insets: { left: 0, right: 0 } }
const DUO_CLOSED = { width: 466, insets: { left: 0, right: 84 } }
const DUO_OPEN = { width: 951, insets: { left: 0, right: 84 } }
const DUO_OPEN_UPRIGHT = { width: 669, insets: { left: 0, right: 0 } }

describe('windowLayout', () => {
  it('gives a phone the bottom bar and one pane', () => {
    expect(windowLayout({ ...PHONE, adaptive: true })).toMatchObject({
      tabBar: 'bottom',
      split: false,
    })
  })

  it('moves the tabs into the side column iPhone Duo keeps', () => {
    expect(windowLayout({ ...DUO_CLOSED, adaptive: true })).toMatchObject({
      tabBar: 'right',
      split: false,
    })
    expect(windowLayout({ ...DUO_OPEN, adaptive: true })).toMatchObject({
      tabBar: 'right',
      split: true,
    })
  })

  it('keeps one roomy pane and the bottom bar upright', () => {
    expect(windowLayout({ ...DUO_OPEN_UPRIGHT, adaptive: true })).toMatchObject({
      tabBar: 'bottom',
      split: false,
    })
  })

  it('puts the column on the left when iOS does', () => {
    const layout = windowLayout({ width: 475, insets: { left: 84, right: 0 }, adaptive: true })
    expect(layout.tabBar).toBe('left')
  })

  it('does not read a landscape notch as a column', () => {
    const layout = windowLayout({ width: 874, insets: { left: 62, right: 62 }, adaptive: true })
    expect(layout.tabBar).toBe('bottom')
  })

  it('changes nothing where the adaptive layout does not apply', () => {
    expect(windowLayout({ ...DUO_OPEN, adaptive: false })).toMatchObject({
      tabBar: 'bottom',
      split: false,
    })
  })
})

describe('paneFrames', () => {
  it('meets at the fold, with the column taken off the trailing pane', () => {
    const { main, aside } = paneFrames(windowLayout({ ...DUO_OPEN, adaptive: true }))
    expect(main).toEqual({ left: 0, width: 475.5 })
    expect(aside).toEqual({ left: 475.5, width: 391.5 })
  })

  it('is the window inside its insets with one pane', () => {
    const { main, aside } = paneFrames(windowLayout({ ...DUO_CLOSED, adaptive: true }))
    expect(main).toEqual({ left: 0, width: 382 })
    expect(aside).toBeNull()
  })
})

describe('overlayInsets', () => {
  it('is the whole window on a phone', () => {
    expect(overlayInsets(windowLayout({ ...PHONE, adaptive: true }))).toEqual({ left: 0, right: 0 })
  })

  it('clears the column, and with two panes keeps to the trailing one', () => {
    expect(overlayInsets(windowLayout({ ...DUO_CLOSED, adaptive: true }))).toEqual({
      left: 0,
      right: 84,
    })
    expect(overlayInsets(windowLayout({ ...DUO_OPEN, adaptive: true }))).toEqual({
      left: 475.5,
      right: 84,
    })
  })
})

describe('splitPanes', () => {
  it('is null without an Aside, so such a screen keeps one pane', () => {
    expect(splitPanes([<Text key="a">A</Text>, <Text key="b">B</Text>])).toBeNull()
  })

  it('sorts children into panes in order, looking through fragments', () => {
    const panes = splitPanes(
      <>
        <Text>Title</Text>
        <Aside>
          <Text>Reviews</Text>
        </Aside>
        <>
          <Text>Chart</Text>
          <Aside>
            <Text>History</Text>
          </Aside>
        </>
      </>,
    )
    expect(panes?.main).toHaveLength(2)
    expect(panes?.aside).toHaveLength(2)
  })
})

describe('Screen with an Aside', () => {
  const page = (
    <Screen testID="first-pane">
      <Text>Summary</Text>
      <Aside>
        <Text>Your day</Text>
      </Aside>
    </Screen>
  )
  const original = ReactNative.Dimensions.get('window')
  const show = async (width: number, right: number) => {
    const window = { width, height: 669, scale: 3, fontScale: 1 }
    ReactNative.Dimensions.set({ window, screen: window })
    const metrics = {
      frame: { x: 0, y: 0, width, height: 669 },
      insets: { top: 0, left: 0, right, bottom: 20 },
    }
    await render(<SafeAreaProvider initialMetrics={metrics}>{page}</SafeAreaProvider>)
  }
  afterEach(() => ReactNative.Dimensions.set({ window: original, screen: original }))

  it('draws one scrolling pane on a phone, in the order written', async () => {
    await show(402, 0)
    const pane = within(screen.getByTestId('first-pane'))
    expect(pane.getByText('Summary')).toBeOnTheScreen()
    expect(pane.getByText('Your day')).toBeOnTheScreen()
  })

  it('gives the aside a pane of its own on iPhone Duo open', async () => {
    await show(951, 84)
    const pane = within(screen.getByTestId('first-pane'))
    expect(pane.getByText('Summary')).toBeOnTheScreen()
    expect(pane.queryByText('Your day')).toBeNull()
    expect(screen.getByText('Your day')).toBeOnTheScreen()
  })
})
