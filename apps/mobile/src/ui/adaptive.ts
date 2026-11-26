import { createContext, useContext } from 'react'
import { Platform, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * How the app arranges itself for the window it has. Every layout decision that
 * depends on the shape of the device is made here and nowhere else, so changing
 * the policy is a change to this file.
 *
 * Every iPhone but one gets the same answer as always: the floating tab bar
 * along the bottom and one column of content. The exception is iPhone Duo,
 * Apple's foldable, and it is recognised by the space iOS gives the app rather
 * than by its model name, because that space is what the layout has to fit:
 *
 * - Closed, and open on its side, iOS keeps a column down one edge for the
 *   status bar and the camera, and reports it as a side safe-area inset. Apple
 *   puts the tab bar in that column too, below the clock, so ours goes there.
 *   Held upright when open, the column is gone and the bar is back at the bottom.
 * - Open, the window is two phones wide with the fold down its centre. A screen
 *   that marks part of itself `<Aside>` shows that part as a second pane, and
 *   the two panes meet at the fold so nothing tappable sits in the crease.
 *
 * An iPad gets the same two ideas without the fold. Its tabs stand in a rail
 * down the leading edge rather than across the bottom of a tall screen, a page
 * with an `Aside` shows two panes once the window is wide enough, and a page of
 * one card or one list keeps to a readable column instead of stretching across
 * the glass. Overlays come in from the bottom as on a phone, but no wider than
 * one, centred.
 *
 * Android is not adaptive yet: its foldables report no side column and its
 * tablets have not been looked at. Either is one line in `deviceClass` once it
 * has.
 */

/**
 * The narrowest side inset taken to be iOS's own column. iPhone Duo's is 84pt;
 * a notched iPhone on its side reports about 62, and this app never rotates
 * there, but the margin keeps that from ever reading as a column.
 */
const SIDE_COLUMN_MIN = 72

/**
 * The content width from which an `Aside` becomes a second pane: two panes of
 * at least a small phone each. Open on its side, iPhone Duo has 867pt; upright
 * it has 669, which is one roomy column rather than two cramped ones.
 */
const SPLIT_MIN_WIDTH = 760

/**
 * The column the tabs stand in on an iPad, which takes it from the page: the
 * rail iPhone Duo uses, at the width of iOS's own column there plus a little,
 * since an iPad's captions run longer than its icons.
 */
const TABLET_RAIL_COLUMN = 88

/**
 * The narrowest iPad window that gets the rail. Narrower (a slide-over, or a
 * window dragged small) is a phone's shape and gets a phone's bottom bar.
 */
const TABLET_RAIL_MIN_WIDTH = 600

/**
 * The widest a page of one card or one list is drawn on an iPad: about the
 * readable width UIKit keeps for body text. Past it a row is mostly empty
 * space between a label and its value.
 */
const READABLE_WIDTH = 680

/**
 * The widest either pane gets on an iPad. Landscape on a 13-inch one would
 * otherwise draw two 640pt phones; the pair stays centred instead.
 */
const TABLET_PANE_MAX = 560

/**
 * The widest an overlay is drawn on an iPad: a sheet, a toast, a dialog, the
 * running workout's bar and the number pad. About a large phone, centred, so
 * a sheet reads as one rather than as a band across the screen.
 */
const TABLET_OVERLAY_MAX = 600

export type TabBarPlacement = 'bottom' | 'left' | 'right'

export type WindowLayout = {
  /** The window's width, whose centre is where iPhone Duo folds. */
  width: number
  /** The side safe-area insets, which `Screen` keeps content inside. */
  left: number
  right: number
  /** Along the bottom, or in a rail down one side. */
  tabBar: TabBarPlacement
  /**
   * How much of the window the tab rail takes from a tab's page beyond the
   * safe area: `TABLET_RAIL_COLUMN` on an iPad, and zero on iPhone Duo, whose
   * rail stands in iOS's own column. Only tab screens give it up; see
   * `NavColumnProvider`.
   */
  railColumn: number
  /** Whether a screen with an `Aside` shows it beside the rest, as a second pane. */
  split: boolean
  /** Whether the two panes meet at a fold, which then has to be the window's centre. */
  fold: boolean
  /** Whether this is an iPad: no fold, a readable column, centred overlays. */
  tablet: boolean
}

/** Which layout a device gets. `null` is the phone layout, whatever the window. */
type DeviceClass = 'phone' | 'tablet' | null

type LayoutInput = {
  width: number
  insets: { left: number; right: number }
  /** See `DeviceClass` and the top of the file. */
  device: DeviceClass
}

export function windowLayout({ width, insets, device }: LayoutInput): WindowLayout {
  const { left, right } = insets
  const base = { width, left, right, railColumn: 0, fold: false, tablet: false }
  if (!device) return { ...base, tabBar: 'bottom', split: false }

  const content = width - left - right
  const split = content >= SPLIT_MIN_WIDTH

  if (device === 'tablet') {
    const rail = content >= TABLET_RAIL_MIN_WIDTH
    return {
      ...base,
      tablet: true,
      tabBar: rail ? 'left' : 'bottom',
      railColumn: rail ? TABLET_RAIL_COLUMN : 0,
      split,
    }
  }

  const tabBar: TabBarPlacement =
    right >= SIDE_COLUMN_MIN ? 'right' : left >= SIDE_COLUMN_MIN ? 'left' : 'bottom'
  // A phone this wide is iPhone Duo open, and its two panes meet at the fold.
  return { ...base, tabBar, split, fold: split }
}

function deviceClass(): DeviceClass {
  if (Platform.OS !== 'ios') return null
  return Platform.isPad ? 'tablet' : 'phone'
}

export function useWindowLayout(): WindowLayout {
  const { width } = useWindowDimensions()
  const { left, right } = useSafeAreaInsets()
  return windowLayout({ width, insets: { left, right }, device: deviceClass() })
}

type PaneFrame = { left: number; width: number }

/**
 * Where each pane sits across the window. `column` is the tab rail's, on a tab
 * screen (`useNavColumn`), which comes off the leading side.
 *
 * One pane is the window inside its side insets. Two on iPhone Duo meet at the
 * window's centre, which is the fold, so the leading pane is as wide as half
 * the window less any inset on its side, and the trailing one likewise: iOS's
 * column makes the trailing pane the narrower. Two on an iPad share what is
 * left equally, each no wider than `TABLET_PANE_MAX`, the pair centred.
 */
export function paneFrames(
  layout: WindowLayout,
  column = 0,
): { main: PaneFrame; aside: PaneFrame | null } {
  const { width, right } = layout
  const left = layout.left + column
  const content = width - left - right
  if (!layout.split) return { main: { left, width: content }, aside: null }
  if (!layout.fold) {
    const pane = Math.min(content / 2, TABLET_PANE_MAX)
    const start = left + (content - pane * 2) / 2
    return { main: { left: start, width: pane }, aside: { left: start + pane, width: pane } }
  }
  const fold = width / 2
  return {
    main: { left, width: fold - left },
    aside: { left: fold, width: width - right - fold },
  }
}

/**
 * The column a page of one pane is drawn in, inside the frame `paneFrames`
 * gives it. The same frame everywhere but two places:
 *
 * - On an iPad, a page of cards and rows keeps to `READABLE_WIDTH`, centred.
 *   A page that sizes a grid to its width (`wide`) takes all of it.
 * - On iPhone Duo open, a `wide` page is made symmetric about the fold, so a
 *   grid with an even number of columns has its middle gap there rather than
 *   a card across the crease.
 */
export function singlePaneFrame(layout: WindowLayout, column = 0, wide = false): PaneFrame {
  const { main } = paneFrames({ ...layout, split: false }, column)
  if (layout.tablet && !wide && main.width > READABLE_WIDTH) {
    return { left: main.left + (main.width - READABLE_WIDTH) / 2, width: READABLE_WIDTH }
  }
  if (layout.fold && wide) {
    const fold = layout.width / 2
    const half = Math.min(fold - main.left, main.left + main.width - fold)
    return { left: fold - half, width: half * 2 }
  }
  return main
}

/**
 * The strip of the window an overlay belongs in: a toast, a sheet, a dialog,
 * the running workout's bar. Returned as the space to leave on each side.
 *
 * Outside the side column always, which on iPhone Duo would otherwise put the
 * camera over a sheet's title. With two panes there, inside the trailing one:
 * an overlay spanning both would sit in the fold, and the trailing side is next
 * to the tab bar and where the device closes onto its outer display.
 *
 * On an iPad, centred and no wider than `TABLET_OVERLAY_MAX`. There is no fold
 * to avoid, and a sheet the width of the screen is a band rather than a sheet.
 */
export function overlayInsets(layout: WindowLayout, column = 0): { left: number; right: number } {
  if (layout.tablet) return centredInsets(layout, TABLET_OVERLAY_MAX, column)
  const { aside } = paneFrames(layout)
  if (!aside) return { left: layout.left, right: layout.right }
  return { left: aside.left, right: layout.right }
}

/**
 * The space to leave either side of something no wider than `max`, centred on
 * the page: the window inside its safe area, less the tab rail's `column` on a
 * tab screen.
 */
function centredInsets(
  layout: WindowLayout,
  max: number,
  column = 0,
): { left: number; right: number } {
  const left = layout.left + column
  const { right } = layout
  const side = Math.max((layout.width - left - right - max) / 2, 0)
  return { left: left + side, right: right + side }
}

export function useOverlayInsets(): { left: number; right: number } {
  return overlayInsets(useWindowLayout(), useNavColumn())
}

/**
 * The width of the pane a component is drawn in, for the few that size
 * themselves by arithmetic rather than by flex: a grid of tiles, a pager.
 * `Screen` provides it for each pane, and a sheet for its panel; outside both
 * it is the window inside its side insets, which on every iPhone but iPhone
 * Duo is the window's width.
 */
const PaneWidthContext = createContext<number | null>(null)
export const PaneWidthProvider = PaneWidthContext.Provider

export function usePaneWidth(): number {
  const pane = useContext(PaneWidthContext)
  const layout = useWindowLayout()
  return pane ?? paneFrames({ ...layout, split: false }).main.width
}

/**
 * How much of a tab screen's leading side the tab rail takes, which the tabs'
 * layout provides and `Screen` keeps the page clear of. Zero on every pushed
 * page, which has no rail, and on iPhone Duo, whose rail is in iOS's column.
 */
const NavColumnContext = createContext(0)
export const NavColumnProvider = NavColumnContext.Provider
export const useNavColumn = () => useContext(NavColumnContext)

/**
 * How many columns a grid of cards takes in `width`: as many as fit at
 * `min` points each with `gap` between, at least `least`. With `even`, an even
 * number, so a grid laid symmetric about iPhone Duo's fold (`singlePaneFrame`)
 * has its middle gap on it.
 */
export function gridColumns(
  width: number,
  {
    min,
    gap,
    least = 2,
    even = false,
  }: { min: number; gap: number; least?: number; even?: boolean },
): number {
  let columns = Math.max(least, Math.floor((width + gap) / (min + gap)))
  if (even && columns % 2 === 1) columns -= 1
  return Math.max(least, columns)
}
