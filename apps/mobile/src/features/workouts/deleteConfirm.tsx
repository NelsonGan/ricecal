import { useState } from 'react'
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
            if (!online) {
              toast.show({ title: t('offline.title'), tone: 'error' })
              throw new Error('offline')
            }
            hold(item)
            try {
              await remove(item)
            } catch (error) {
              hold(null)
              toast.show({ title: failed, tone: 'error' })
              throw error
            }
            await done(item)
          },
        },
      ]}
    />
  )

  return { open, button, dialog }
}
