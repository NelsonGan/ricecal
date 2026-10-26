import { Children, cloneElement, Fragment, isValidElement, type ReactNode } from 'react'

/**
 * The part of a screen that moves into a second pane when the window has room
 * for two (`useWindowLayout().split`), which today means iPhone Duo open.
 *
 * Anywhere else it is nothing at all: its children render where it stands, so
 * a phone draws the screen exactly as written. That is the point of marking a
 * pane rather than passing one as a prop, since a screen's phone order rarely
 * puts everything for the second pane last.
 *
 * Only an `Aside` among `Screen`'s own children counts, looking through
 * fragments and nothing else. One inside a component is that component's
 * business and renders in place.
 */
export function Aside({ children }: { children?: ReactNode }) {
  return <>{children}</>
}

/**
 * A screen's children, sorted into its two panes in their written order. Null
 * when there is no `Aside`, so a screen without one keeps one pane however wide
 * the window.
 */
export function splitPanes(children: ReactNode): { main: ReactNode[]; aside: ReactNode[] } | null {
  const main: ReactNode[] = []
  const aside: ReactNode[] = []
  let found = false

  const walk = (nodes: ReactNode, prefix: string) => {
    for (const child of Children.toArray(nodes)) {
      if (!isValidElement<{ children?: ReactNode }>(child)) {
        main.push(child)
        continue
      }
      // Keys from different fragments can repeat, so each keeps its path.
      const key = `${prefix}${child.key ?? ''}`
      if (child.type === Fragment) {
        walk(child.props.children, key)
      } else if (child.type === Aside) {
        found = true
        aside.push(<Fragment key={key}>{child.props.children}</Fragment>)
      } else {
        main.push(cloneElement(child, { key }))
      }
    }
  }
  walk(children, '')

  return found ? { main, aside } : null
}
