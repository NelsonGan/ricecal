import { screen, waitFor } from '@testing-library/react-native'

import { render } from '@/test-utils'
import { Text } from '@/ui'
import { useAfterInteractions } from '../use-after-interactions'

/**
 * The staging behind the picture picker's grid, on its own.
 *
 * What matters is the order: false on the frame the component mounts, true once
 * the thread is free. That is what lets the sheet build thirty of its tiles on the
 * frame it opens and the rest immediately afterwards; building all of them at once
 * delayed the panel's rise, which is what "laggy" was.
 *
 * Tested here rather than through the sheet, which cannot pin it: whether the
 * second stage has flushed by the time `render` resolves depends on what else is
 * queued.
 */
function Probe({ active }: { active: boolean }) {
  const settled = useAfterInteractions(active)
  return <Text>{settled ? 'settled' : 'waiting'}</Text>
}

it('waits on the first render and settles once the thread is free', async () => {
  await render(<Probe active />)

  await waitFor(() => expect(screen.getByText('settled')).toBeOnTheScreen())
})

/** Nothing to stage while the thing it belongs to is closed. */
it('stays waiting while inactive', async () => {
  await render(<Probe active={false} />)

  expect(screen.getByText('waiting')).toBeOnTheScreen()
})

/**
 * And starts again on the way back in. A sheet that reopened remembering it had
 * finished would build everything on the frame it opens, which is the whole problem.
 */
it('goes back to waiting when it is switched off', async () => {
  const view = await render(<Probe active />)
  await waitFor(() => expect(screen.getByText('settled')).toBeOnTheScreen())

  // `await` because RNTL v14's `rerender` is async like its `render`, not because the
  // hook needs a moment: switching off takes effect on the render that switched it,
  // so once this commit has landed there is nothing further to wait for.
  await view.rerender(<Probe active={false} />)

  expect(screen.getByText('waiting')).toBeOnTheScreen()
})
