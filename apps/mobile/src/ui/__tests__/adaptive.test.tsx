import * as ReactNative from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { render, screen, within } from '../../test-utils'
import { Aside, splitPanes } from '../Aside'
import { overlayInsets, paneFrames, windowLayout } from '../adaptive'
import { NavBar, NavItem } from '../BottomNav'
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

  it('stands the footer under the second pane with two', async () => {
    const window = { width: 951, height: 669, scale: 3, fontScale: 1 }
    ReactNative.Dimensions.set({ window, screen: window })
    const metrics = {
      frame: { x: 0, y: 0, width: 951, height: 669 },
      insets: { top: 0, left: 0, right: 84, bottom: 20 },
    }
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Screen footer={<Text>Subscribe</Text>}>
          <Text>What Pro adds</Text>
          <Aside>
            <Text>Plans</Text>
          </Aside>
        </Screen>
      </SafeAreaProvider>,
    )
    // The nearest box holding both the footer and the plans is the second
    // pane, and it does not hold the first pane's content.
    let box = screen.getByText('Subscribe').parent
    while (box && within(box).queryByText('Plans') === null) box = box.parent
    expect(box).not.toBeNull()
    expect(within(box as never).queryByText('What Pro adds')).toBeNull()
  })

  it('gives the aside a pane of its own on iPhone Duo open', async () => {
    await show(951, 84)
    const pane = within(screen.getByTestId('first-pane'))
    expect(pane.getByText('Summary')).toBeOnTheScreen()
    expect(pane.queryByText('Your day')).toBeNull()
    expect(screen.getByText('Your day')).toBeOnTheScreen()
  })
})

describe('NavBar', () => {
  const original = ReactNative.Dimensions.get('window')
  const show = async (width: number, right: number) => {
    const window = { width, height: 678, scale: 3, fontScale: 1 }
    ReactNative.Dimensions.set({ window, screen: window })
    const metrics = {
      frame: { x: 0, y: 0, width, height: 678 },
      insets: { top: 0, left: 0, right, bottom: 34 },
    }
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <NavBar>
          <NavItem label="Today" icon={{ set: 'ui', name: 'home' }} isFocused />
          <NavItem label="Me" icon={{ set: 'ui', name: 'profile' }} />
        </NavBar>
      </SafeAreaProvider>,
    )
  }
  afterEach(() => ReactNative.Dimensions.set({ window: original, screen: original }))
  // The tab list is not an accessibility element, so it is found by role in the
  // rendered tree. Its width is a style, set only in the rail.
  const tablist = () => {
    type Node = { props?: Record<string, unknown>; children?: unknown[] | null }
    const find = (node: unknown): Node | null => {
      if (!node || typeof node !== 'object') return null
      const n = node as Node
      if (n.props?.accessibilityRole === 'tablist') return n
      for (const child of n.children ?? []) {
        const hit = find(child)
        if (hit) return hit
      }
      return null
    }
    const tree = screen.toJSON()
    return (Array.isArray(tree) ? tree.map(find).find(Boolean) : find(tree)) ?? null
  }
  const width = () => ReactNative.StyleSheet.flatten(tablist()?.props?.style as never)?.width

  it('is a bar across the bottom on a phone', async () => {
    await show(402, 0)
    expect(tablist()).not.toBeNull()
    expect(width()).toBeUndefined()
  })

  it('stands in the side column on iPhone Duo, items stacked', async () => {
    await show(466, 84)
    // The 84pt column less a margin either side.
    expect(width()).toBe(68)
    expect(screen.getByLabelText('Me')).toBeOnTheScreen()
  })
})
