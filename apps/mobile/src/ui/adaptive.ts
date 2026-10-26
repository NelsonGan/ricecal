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
 * Only on iOS phones for now. An iPad already has a regular-width window and has
 * always had the phone layout, and Android foldables report no side column; each
 * of those is one line in `adaptiveLayoutApplies` once it has been looked at.
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

export type TabBarPlacement = 'bottom' | 'left' | 'right'

export type WindowLayout = {
  /** The window's width, whose centre is where iPhone Duo folds. */
  width: number
  /** The side safe-area insets, which `Screen` keeps content inside. */
  left: number
  right: number
  /** Along the bottom, or in the side column iOS keeps on iPhone Duo. */
  tabBar: TabBarPlacement
  /** Whether a screen with an `Aside` shows it beside the rest, as a second pane. */
  split: boolean
}

type LayoutInput = {
  width: number
  insets: { left: number; right: number }
  /** Whether this device gets anything but the phone layout. See the top of the file. */
  adaptive: boolean
}

export function windowLayout({ width, insets, adaptive }: LayoutInput): WindowLayout {
  const { left, right } = insets
  if (!adaptive) return { width, left, right, tabBar: 'bottom', split: false }

  const tabBar: TabBarPlacement =
    right >= SIDE_COLUMN_MIN ? 'right' : left >= SIDE_COLUMN_MIN ? 'left' : 'bottom'
  return { width, left, right, tabBar, split: width - left - right >= SPLIT_MIN_WIDTH }
}

function adaptiveLayoutApplies(): boolean {
  return Platform.OS === 'ios' && !Platform.isPad
}

export function useWindowLayout(): WindowLayout {
  const { width } = useWindowDimensions()
  const { left, right } = useSafeAreaInsets()
  return windowLayout({ width, insets: { left, right }, adaptive: adaptiveLayoutApplies() })
}

type PaneFrame = { left: number; width: number }

/**
 * Where each pane sits across the window. One pane is the window inside its
 * side insets. Two meet at the window's centre, which is the fold, so the
 * leading pane is as wide as half the window less any inset on its side, and
 * the trailing one likewise: iOS's column makes the trailing pane the narrower.
 */
export function paneFrames(layout: WindowLayout): { main: PaneFrame; aside: PaneFrame | null } {
  const { width, left, right } = layout
  if (!layout.split) return { main: { left, width: width - left - right }, aside: null }
  const fold = width / 2
  return {
    main: { left, width: fold - left },
    aside: { left: fold, width: width - right - fold },
  }
}

/**
 * The strip of the window an overlay belongs in: a toast, a sheet, a dialog,
 * the running workout's bar. Returned as the space to leave on each side.
 *
 * Outside the side column always, which on iPhone Duo would otherwise put the
 * camera over a sheet's title. With two panes, inside the trailing one: an
 * overlay spanning both would sit in the fold, and the trailing side is next to
 * the tab bar and where the device closes onto its outer display.
 */
export function overlayInsets(layout: WindowLayout): { left: number; right: number } {
  const { aside } = paneFrames(layout)
  if (!aside) return { left: layout.left, right: layout.right }
  return { left: aside.left, right: layout.right }
}

export function useOverlayInsets(): { left: number; right: number } {
  return overlayInsets(useWindowLayout())
}

/**
 * The width of the pane a component is drawn in, for the few that size
 * themselves by arithmetic rather than by flex: a grid of tiles, a pager.
 * `Screen` provides it for each pane; outside one it is the window inside its
 * side insets, which on every iPhone but iPhone Duo is the window's width.
 */
const PaneWidthContext = createContext<number | null>(null)
export const PaneWidthProvider = PaneWidthContext.Provider

export function usePaneWidth(): number {
  const pane = useContext(PaneWidthContext)
  const layout = useWindowLayout()
  return pane ?? paneFrames({ ...layout, split: false }).main.width
}
