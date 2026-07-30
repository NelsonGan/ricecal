import { screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { render } from '@/test-utils'
import { SwipePager } from '../SwipePager'

/**
 * The pager's promise is that all three pages are real.
 *
 * That is the whole reason a swipe does not show a spinner, and it is what makes the
 * page keys load-bearing: moving forward, the middle page becomes the previous one
 * and keeps its key, so React keeps its subtree — and its data — rather than
 * mounting it again a page to the left.
 *
 * The drag itself is not exercised. RNTL does not drive real gestures, and what
 * would be asserted is a shared value on the UI thread.
 */

const page = (key: string) => ({ key, node: <Text>{key}</Text> })

it('renders the previous and next page, not just the current one', async () => {
  await render(
    <SwipePager
      pages={[page('mon'), page('tue'), page('wed')]}
      onStep={() => {}}
      scrollablePages
    />,
  )

  expect(screen.getByText('mon')).toBeOnTheScreen()
  expect(screen.getByText('tue')).toBeOnTheScreen()
  expect(screen.getByText('wed')).toBeOnTheScreen()
})

/**
 * A page that stays on screen across a step must not be rebuilt, or everything it
 * had — its scroll offset, its query subscription, the day it had finished loading —
 * goes with it. Its key is what tells React that, so the keys have to be the pages'
 * own identities and not their positions.
 */
it('keeps a page subtree when it moves position', async () => {
  const view = await render(
    <SwipePager pages={[page('mon'), page('tue'), page('wed')]} onStep={() => {}} />,
  )

  const tuesday = screen.getByText('tue')

  // One step forward: Tuesday is now the page on the left.
  view.rerender(<SwipePager pages={[page('tue'), page('wed'), page('thu')]} onStep={() => {}} />)

  // The same host node, not a replacement — which is what "keeps its subtree" means.
  expect(screen.getByText('tue')).toBe(tuesday)
})
