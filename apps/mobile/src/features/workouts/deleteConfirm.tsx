import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useOnline } from '@/lib/online'
import { Dialog, Icon, IconButton, useToast } from '@/ui'

/**
 * Deleting what a page shows, asked first: `open` asks, `button` draws an app
 * bar delete that does, and `dialog` is to be rendered.
 *
 * Offline it says so and stays open: the delete would pause rather than fail,
 * and the dialog would spin with no way out. Otherwise the item is held from
 * the moment the delete starts (`hold`), because the delete refetches it away
 * before the page has gone, and the page flashed "gone" or a blank form under
 * the closing dialog. A refused delete lets go, says `failed`, and stays open.
 */
export function useDeleteConfirm<T>({
  item,
  title,
  description,
  remove,
  hold,
  failed,
  done,
}: {
  item: T | null | undefined
  title: string
  description: string
  remove: (item: T) => Promise<unknown>
  /** Told the item being deleted, and null if the delete fails. */
  hold: (item: T | null) => void
  failed: string
  /** Once it is gone: leave the page. */
  done: (item: T) => unknown
}) {
  const { t } = useTranslation('common')
  const toast = useToast()
  const online = useOnline()
  const [asking, setAsking] = useState(false)
  const open = () => setAsking(true)

  const button = (label: string) => (
    <IconButton size="sm" variant="neutral" accessibilityLabel={label} onPress={open}>
      <Icon set="ui" name="delete" size={20} />
    </IconButton>
  )

  const dialog = (
    <Dialog
      visible={asking}
      onClose={() => setAsking(false)}
      title={title}
      description={description}
      cancelLabel={t('action.keep')}
      actions={[
        {
          key: 'delete',
          label: t('action.delete'),
          tone: 'danger',
          waits: true,
          onPress: async () => {
            if (!item) return
            await removeOrSay({
              online,
              say: (title) => toast.show({ title, tone: 'error' }),
              offline: t('offline.title'),
              failed,
              remove: () => {
                hold(item)
                return remove(item)
              },
              refused: () => hold(null),
            })
            await done(item)
          },
        },
      ]}
    />
  )

  return { open, button, dialog }
}

/**
 * The same question for a row swiped open on a list, where there is no page to
 * leave: `ask` opens the dialog and answers whether the item went, so `SwipeRow`
 * can slide a kept row back. A workout cannot be queued offline the way a meal
 * can, so offline it says so and the row stays.
 */
export function useAskedDelete<T>({
  title,
  description,
  remove,
  failed,
  done,
}: {
  title: string
  description: (item: T) => string
  remove: (item: T) => Promise<unknown>
  failed: string
  /** Once it is gone. */
  done?: (item: T) => unknown
}) {
  const { t } = useTranslation('common')
  const toast = useToast()
  const online = useOnline()
  // Which item is being asked about, kept apart from whether the dialog is
  // up: the delete reads it, and it outlives the closing dialog.
  const [asking, setAsking] = useState<T | null>(null)
  const [open, setOpen] = useState(false)
  const answer = useRef<((gone: boolean) => void) | undefined>(undefined)
  const settle = (gone: boolean) => {
    answer.current?.(gone)
    answer.current = undefined
  }

  const ask = (item: T): Promise<boolean> => {
    if (!online) {
      toast.show({ title: t('offline.title'), tone: 'error' })
      return Promise.resolve(false)
    }
    settle(false)
    setAsking(item)
    setOpen(true)
    return new Promise((resolve) => {
      answer.current = resolve
    })
  }

  const dialog = (
    <Dialog
      visible={open}
      onClose={() => {
        setOpen(false)
        // After a delete this has already been answered.
        settle(false)
      }}
      title={title}
      description={asking === null ? undefined : description(asking)}
      cancelLabel={t('action.keep')}
      actions={[
        {
          key: 'delete',
          label: t('action.delete'),
          tone: 'danger',
          waits: true,
          onPress: async () => {
            if (asking === null) return
            await removeOrSay({
              online,
              say: (title) => toast.show({ title, tone: 'error' }),
              offline: t('offline.title'),
              failed,
              remove: () => remove(asking),
            })
            settle(true)
            await done?.(asking)
          },
        },
      ]}
    />
  )

  return { ask, dialog }
}

/**
 * The delete both dialogs run. Refused offline, where it would pause rather
 * than fail and the dialog would spin with no way out; a refused delete says
 * `failed`. Either way it throws, so the dialog stays open.
 */
async function removeOrSay({
  online,
  say,
  offline,
  failed,
  remove,
  refused,
}: {
  online: boolean
  say: (title: string) => void
  offline: string
  failed: string
  remove: () => Promise<unknown>
  refused?: () => void
}) {
  if (!online) {
    say(offline)
    throw new Error('offline')
  }
  try {
    await remove()
  } catch (error) {
    refused?.()
    say(failed)
    throw error
  }
}
