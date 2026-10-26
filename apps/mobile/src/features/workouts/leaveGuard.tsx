import { usePreventRemove } from 'expo-router/react-navigation'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/ui'

/**
 * What a workout editor does about being left: the back button, the swipe,
 * Android's back and the swipe that closes the whole workout stack, which a
 * screen's own `gestureEnabled` does not reach.
 *
 * While `busy` (a save in flight) leaving is held. A save that navigates when
 * it lands, left mid-save, popped whatever had come on top, or on the finish
 * screen cleared a workout somebody had gone back to keep logging.
 *
 * With `dirty` changes it asks first, rather than dropping a routine or an
 * edit that took a while to make.
 *
 * The screen's own way out once its work is done goes through `leave`: the
 * guard is switched off first and the navigation runs once that has rendered.
 * Run straight away it was refused, and re-sent from the refusal it was
 * dropped, so the finish screen stayed in the stack under the saved workout.
 * Since SDK 58 the refused action is resumed with the hook's `repeat`, and
 * `disablePrevention` is called before any other way out, as the hook asks.
 * Render `dialog`.
 */
export function useLeaveGuard({ busy, dirty }: { busy: boolean; dirty: boolean }) {
  const { t } = useTranslation(['workouts', 'common'])
  const [leaving, setLeaving] = useState<{ go: () => void } | null>(null)
  // The refused removal, kept as the function that resumes it.
  const [held, setHeld] = useState<{ repeat: () => void } | null>(null)

  const disablePrevention = usePreventRemove((busy || dirty) && !leaving, ({ repeat }) => {
    // Held while saving; with changes, asked about.
    if (!busy) setHeld({ repeat })
  })
  // Declared after the guard, so it runs once the guard has stood down.
  useEffect(() => {
    if (!leaving) return
    disablePrevention()
    leaving.go()
  }, [leaving, disablePrevention])

  const leave = useCallback((go: () => void) => setLeaving({ go }), [])

  const dialog = (
    <Dialog
      visible={held !== null}
      onClose={() => setHeld(null)}
      title={t('workouts:edit.leaveTitle')}
      description={t('workouts:edit.leaveBody')}
      cancelLabel={t('common:action.cancel')}
      actions={[
        {
          key: 'discard',
          label: t('workouts:logger.discardConfirm'),
          tone: 'danger',
          onPress: () => {
            if (held) leave(held.repeat)
          },
        },
      ]}
    />
  )

  return { leave, dialog }
}
