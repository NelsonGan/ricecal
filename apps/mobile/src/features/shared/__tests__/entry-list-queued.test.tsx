import '@/i18n'

import type { DayLog } from '@/data'
import { type PendingSnap, pendingAsEntry } from '@/data/pending-snaps'
import { render, screen, userEvent } from '@/test-utils'
import { EntryList } from '../EntryList'

/**
 * The row a meal taken without a connection leaves on the day. It used to be
 * "Could not read this one" with the meal lost; it says it is waiting instead,
 * counts nothing, and its one action is taking the meal back.
 */

jest.mock('@/data', () => ({
  useRefiningEntries: () => ({ ids: [] }),
  useMealPhotoUrl: () => ({ data: undefined }),
  storedImageSource: (_path?: string, _url?: string, local?: string) =>
    local ? { uri: local } : undefined,
}))
jest.mock('@/data/queued-photos', () => ({ queuedPhotoUri: (uri?: string) => uri }))

const user = userEvent.setup()

function dayWith(snap: Partial<PendingSnap>): DayLog {
  return {
    date: '2026-11-26',
    waterMl: 0,
    entries: [
      pendingAsEntry({
        id: 'snap-1',
        logDate: '2026-11-26',
        loggedAt: '2026-11-26T04:00:00.000Z',
        status: 'queued',
        ...snap,
      }),
    ],
  }
}

it('says a photographed meal is waiting for a connection, and counts nothing', async () => {
  await render(
    <EntryList
      day={dayWith({ photoUri: 'file:///documents/queued-snaps/snap-1.jpg' })}
      title="Your day"
    />,
  )
  expect(screen.getByText('Waiting for a connection')).toBeOnTheScreen()
  expect(screen.getByText('Sends when you are back online')).toBeOnTheScreen()
  expect(screen.queryByText(/kcal/)).toBeNull()
  expect(screen.queryByText('Could not read this one')).toBeNull()
})

it('shows what was typed for a typed meal', async () => {
  await render(<EntryList day={dayWith({ text: 'nasi lemak with teh tarik' })} title="Your day" />)
  expect(screen.getByText('Waiting for a connection')).toBeOnTheScreen()
  expect(screen.getByText('nasi lemak with teh tarik')).toBeOnTheScreen()
})

it('takes the meal back with its close button', async () => {
  const onDismissEntry = jest.fn()
  await render(
    <EntryList
      day={dayWith({ photoUri: 'file:///documents/queued-snaps/snap-1.jpg' })}
      title="Your day"
      onDismissEntry={onDismissEntry}
    />,
  )
  await user.press(screen.getByRole('button', { name: 'Remove' }))
  expect(onDismissEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'snap-1' }))
})
