import type React from 'react'
import * as ReactNative from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { render, screen, within } from '../../test-utils'
import { Aside, splitPanes } from '../Aside'
import {
  gridColumns,
  NavColumnProvider,
  overlayInsets,
  paneFrames,
  singlePaneFrame,
  usePaneWidth,
  windowLayout,
} from '../adaptive'
import { NavBar, NavItem } from '../BottomNav'
import { Screen } from '../Screen'
import { Text } from '../Text'

// Points from the iPhone Duo simulator (iOS 27.1) and an iPhone 18 Pro.
const PHONE = { width: 402, insets: { left: 0, right: 0 } }
const DUO_CLOSED = { width: 466, insets: { left: 0, right: 84 } }
const DUO_OPEN = { width: 951, insets: { left: 0, right: 84 } }
const DUO_OPEN_UPRIGHT = { width: 669, insets: { left: 0, right: 0 } }
// iPad Pro 13-inch upright and on its side, and a window dragged narrow.
const IPAD = { width: 1032, insets: { left: 0, right: 0 } }
const IPAD_SIDEWAYS = { width: 1376, insets: { left: 0, right: 0 } }
const IPAD_NARROW = { width: 500, insets: { left: 0, right: 0 } }

/** Run as an iPad until the spy is restored. `isPad` is a getter on iOS's `Platform`. */
const asIpad = () =>
  jest
    .spyOn(ReactNative.Platform as unknown as { readonly isPad: boolean }, 'isPad', 'get')
    .mockReturnValue(true)

describe('windowLayout', () => {
  it('gives a phone the bottom bar and one pane', () => {
    expect(windowLayout({ ...PHONE, device: 'phone' })).toMatchObject({
      tabBar: 'bottom',
      split: false,
    })
  })

  it('moves the tabs into the side column iPhone Duo keeps', () => {
    expect(windowLayout({ ...DUO_CLOSED, device: 'phone' })).toMatchObject({
      tabBar: 'right',
      split: false,
    })
    expect(windowLayout({ ...DUO_OPEN, device: 'phone' })).toMatchObject({
      tabBar: 'right',
      split: true,
    })
  })

  it('keeps one roomy pane and the bottom bar upright', () => {
    expect(windowLayout({ ...DUO_OPEN_UPRIGHT, device: 'phone' })).toMatchObject({
      tabBar: 'bottom',
      split: false,
    })
  })

  it('puts the column on the left when iOS does', () => {
    const layout = windowLayout({ width: 475, insets: { left: 84, right: 0 }, device: 'phone' })
    expect(layout.tabBar).toBe('left')
  })

  it('does not read a landscape notch as a column', () => {
    const layout = windowLayout({ width: 874, insets: { left: 62, right: 62 }, device: 'phone' })
    expect(layout.tabBar).toBe('bottom')
  })

  it('gives an iPad a rail down the leading edge and two panes, with no fold', () => {
    expect(windowLayout({ ...IPAD, device: 'tablet' })).toMatchObject({
      tabBar: 'left',
      railColumn: 88,
      split: true,
      fold: false,
      tablet: true,
    })
  })

  it('splits an 11-inch iPad upright only where no rail takes its column', () => {
    const ipad11 = { width: 820, insets: { left: 0, right: 0 }, device: 'tablet' } as const
    expect(windowLayout(ipad11).split).toBe(true)
    // 732pt past the rail: one roomy column, not two of 366.
    expect(windowLayout({ ...ipad11, column: 88 }).split).toBe(false)
    expect(windowLayout({ ...IPAD, device: 'tablet', column: 88 }).split).toBe(true)
  })

  it('gives a narrow iPad window the bottom bar and one pane', () => {
    expect(windowLayout({ ...IPAD_NARROW, device: 'tablet' })).toMatchObject({
      tabBar: 'bottom',
      railColumn: 0,
      split: false,
    })
  })

  it('marks iPhone Duo open as folding, and never a phone with one pane', () => {
    expect(windowLayout({ ...DUO_OPEN, device: 'phone' }).fold).toBe(true)
    expect(windowLayout({ ...DUO_CLOSED, device: 'phone' }).fold).toBe(false)
    expect(windowLayout({ ...PHONE, device: 'phone' }).railColumn).toBe(0)
  })

  it('changes nothing where the adaptive layout does not apply', () => {
    expect(windowLayout({ ...DUO_OPEN, device: null })).toMatchObject({
      tabBar: 'bottom',
      split: false,
    })
  })
})

describe('paneFrames', () => {
  it('meets at the fold, with the column taken off the trailing pane', () => {
    const { main, aside } = paneFrames(windowLayout({ ...DUO_OPEN, device: 'phone' }))
    expect(main).toEqual({ left: 0, width: 475.5 })
    expect(aside).toEqual({ left: 475.5, width: 391.5 })
  })

  it('is the window inside its insets with one pane', () => {
    const { main, aside } = paneFrames(windowLayout({ ...DUO_CLOSED, device: 'phone' }))
    expect(main).toEqual({ left: 0, width: 382 })
    expect(aside).toBeNull()
  })

  it('shares an iPad equally past the rail', () => {
    const { main, aside } = paneFrames(windowLayout({ ...IPAD, device: 'tablet', column: 88 }), 88)
    expect(main).toEqual({ left: 88, width: 472 })
    expect(aside).toEqual({ left: 560, width: 472 })
  })

  it('caps each pane on a wide iPad and centres the pair', () => {
    const { main, aside } = paneFrames(
      windowLayout({ ...IPAD_SIDEWAYS, device: 'tablet', column: 88 }),
      88,
    )
    expect(main).toEqual({ left: 172, width: 560 })
    expect(aside).toEqual({ left: 732, width: 560 })
  })
})

describe('singlePaneFrame', () => {
  it('is the whole pane on a phone, wide or not', () => {
    const layout = windowLayout({ ...PHONE, device: 'phone' })
    expect(singlePaneFrame(layout)).toEqual({ left: 0, width: 402 })
    expect(singlePaneFrame(layout, 0, true)).toEqual({ left: 0, width: 402 })
  })

  it('keeps an iPad page to a readable column, centred past the rail', () => {
    const layout = windowLayout({ ...IPAD, device: 'tablet' })
    expect(singlePaneFrame(layout, 88)).toEqual({ left: 220, width: 680 })
    // A pushed page has no rail.
    expect(singlePaneFrame(layout)).toEqual({ left: 176, width: 680 })
  })

  it('gives a wide iPad page all of it', () => {
    const layout = windowLayout({ ...IPAD, device: 'tablet' })
    expect(singlePaneFrame(layout, 88, true)).toEqual({ left: 88, width: 944 })
  })

  it('lays a wide page on iPhone Duo open symmetric about the fold', () => {
    const layout = windowLayout({ ...DUO_OPEN, device: 'phone' })
    const frame = singlePaneFrame(layout, 0, true)
    expect(frame).toEqual({ left: 84, width: 783 })
    expect(frame.left + frame.width / 2).toBe(951 / 2)
    // A page that is not wide keeps the whole pane, as it always has.
    expect(singlePaneFrame(layout)).toEqual({ left: 0, width: 867 })
  })
})

describe('gridColumns', () => {
  // The recipes shelf's.
  const card = { min: 172, gap: 14 }
  it('keeps two to a row on a phone, even a small one', () => {
    expect(gridColumns(362, card)).toBe(2)
    expect(gridColumns(280, card)).toBe(2)
  })

  it('fills an iPad', () => {
    // A tab page's inner width past the rail: 13-inch upright and sideways,
    // 11-inch upright.
    expect(gridColumns(904, card)).toBe(4)
    expect(gridColumns(1248, card)).toBe(6)
    expect(gridColumns(692, card)).toBe(3)
  })

  it('keeps an even count when asked, so the fold falls between two', () => {
    expect(gridColumns(743, card)).toBe(4)
    expect(gridColumns(560, card)).toBe(3)
    expect(gridColumns(560, { ...card, even: true })).toBe(2)
  })
})

describe('overlayInsets', () => {
  it('is the whole window on a phone', () => {
    expect(overlayInsets(windowLayout({ ...PHONE, device: 'phone' }))).toEqual({
      left: 0,
      right: 0,
    })
  })

  it('is centred and no wider than a large phone on an iPad', () => {
    expect(overlayInsets(windowLayout({ ...IPAD, device: 'tablet' }))).toEqual({
      left: 216,
      right: 216,
    })
    expect(overlayInsets(windowLayout({ ...IPAD_NARROW, device: 'tablet' }))).toEqual({
      left: 0,
      right: 0,
    })
  })

  it('centres on the page beside the rail on an iPad tab screen', () => {
    // 944pt of page past the 88pt rail, 600pt of it the overlay's.
    expect(overlayInsets(windowLayout({ ...IPAD, device: 'tablet' }), 88)).toEqual({
      left: 260,
      right: 172,
    })
    // A window just wide enough for the rail keeps the overlay out of it.
    const narrow = windowLayout({ width: 700, insets: { left: 0, right: 0 }, device: 'tablet' })
    expect(overlayInsets(narrow, 88).left).toBe(94)
  })

  it('clears the column, and with two panes keeps to the trailing one', () => {
    expect(overlayInsets(windowLayout({ ...DUO_CLOSED, device: 'phone' }))).toEqual({
      left: 0,
      right: 84,
    })
    expect(overlayInsets(windowLayout({ ...DUO_OPEN, device: 'phone' }))).toEqual({
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

        <Text>Chart</Text>
        <Aside>
          <Text>History</Text>
        </Aside>
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

  it('keeps a page without an Aside whole on iPhone Duo open, footer and all', async () => {
    const window = { width: 951, height: 669, scale: 3, fontScale: 1 }
    ReactNative.Dimensions.set({ window, screen: window })
    const metrics = {
      frame: { x: 0, y: 0, width: 951, height: 669 },
      insets: { top: 0, left: 0, right: 84, bottom: 20 },
    }
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Screen testID="page" footer={<Text>Save</Text>}>
          <Text>Settings</Text>
        </Screen>
      </SafeAreaProvider>,
    )
    // The gutter both sides, and the footer flush with the page rather than
    // pushed out by half a window: measured against the first of two panes,
    // this page lost its right gutter and its footer ran off the edge.
    const content = ReactNative.StyleSheet.flatten(
      screen.getByTestId('page').props.contentContainerStyle,
    )
    expect(content.paddingLeft).toBe(20)
    expect(content.paddingRight).toBe(20)
    let footer = screen.getByText('Save').parent
    while (footer && ReactNative.StyleSheet.flatten(footer.props.style)?.marginRight === undefined)
      footer = footer.parent
    expect(ReactNative.StyleSheet.flatten(footer?.props.style)).toMatchObject({
      marginLeft: 0,
      marginRight: 0,
    })
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

  it('stands in a column of its own on an iPad', async () => {
    const pad = asIpad()
    try {
      await show(1032, 0)
      // The 88pt column less a margin either side.
      expect(width()).toBe(72)
    } finally {
      pad.mockRestore()
    }
  })

  it('stands in the side column on iPhone Duo, items stacked', async () => {
    await show(466, 84)
    // The 84pt column less a margin either side.
    expect(width()).toBe(68)
    expect(screen.getByLabelText('Me')).toBeOnTheScreen()
  })
})

describe('Screen on an iPad', () => {
  const original = ReactNative.Dimensions.get('window')
  let pad: jest.SpyInstance
  beforeEach(() => {
    pad = asIpad()
  })
  afterEach(() => {
    pad.mockRestore()
    ReactNative.Dimensions.set({ window: original, screen: original })
  })

  function Width({ label }: { label: string }) {
    return (
      <Text>
        {label} {usePaneWidth()}
      </Text>
    )
  }

  const show = async (page: React.ReactElement, width = 1032) => {
    const window = { width, height: 1376, scale: 2, fontScale: 1 }
    ReactNative.Dimensions.set({ window, screen: window })
    const metrics = {
      frame: { x: 0, y: 0, width, height: 1376 },
      insets: { top: 24, left: 0, right: 0, bottom: 20 },
    }
    await render(<SafeAreaProvider initialMetrics={metrics}>{page}</SafeAreaProvider>)
  }

  it('keeps a page of one pane to a readable column, centred', async () => {
    await show(
      <Screen testID="page">
        <Width label="column" />
      </Screen>,
    )
    expect(screen.getByText('column 680')).toBeOnTheScreen()
    // (1032 - 680) / 2 either side, inside the gutter.
    const content = ReactNative.StyleSheet.flatten(
      screen.getByTestId('page').props.contentContainerStyle,
    )
    expect(content.paddingLeft).toBe(196)
    expect(content.paddingRight).toBe(196)
  })

  it('gives a wide page the whole width past the rail', async () => {
    await show(
      <NavColumnProvider value={88}>
        <Screen wide>
          <Width label="grid" />
        </Screen>
      </NavColumnProvider>,
    )
    expect(screen.getByText('grid 944')).toBeOnTheScreen()
  })

  it('splits a page with an Aside into two equal panes', async () => {
    await show(
      <NavColumnProvider value={88}>
        <Screen testID="first-pane">
          <Width label="main" />
          <Aside>
            <Width label="aside" />
          </Aside>
        </Screen>
      </NavColumnProvider>,
    )
    const pane = within(screen.getByTestId('first-pane'))
    expect(pane.getByText('main 472')).toBeOnTheScreen()
    expect(pane.queryByText('aside 472')).toBeNull()
    expect(screen.getByText('aside 472')).toBeOnTheScreen()
  })
})
