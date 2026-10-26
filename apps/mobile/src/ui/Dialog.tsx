import { useEffect, useRef, useState } from 'react'
import { Modal, Platform, Pressable, View } from 'react-native'

import { useOverlayInsets } from './adaptive'
import { Button } from './Button'
import { Text } from './Text'
import { useHeld } from './useHeld'

export type DialogAction = {
  key: string
  label: string
  /** `primary` for the answer most people give, `danger` for one that deletes. */
  tone?: 'primary' | 'secondary' | 'danger'
  onPress: () => void | Promise<void>
  /**
   * Run while the dialog stays open, with a spinner, and close when it
   * resolves. For an answer that writes to the server: a rejection keeps the
   * dialog open, since closing would say the thing happened.
   */
  waits?: boolean
}

export type DialogProps = {
  visible: boolean
  onClose: () => void
  title: string
  description?: string
  actions: readonly DialogAction[]
  /** The way out without answering. */
  cancelLabel: string
}

/**
 * A question in the middle of the screen: a few answers stacked as full-width
 * buttons, in reach of either thumb.
 *
 * For a question the app asks ("save the unfinished sets?", "update the
 * routine?"), where a bottom sheet put the answers at the far edge and read
 * as a menu. A list of things to do to an item stays a sheet.
 *
 * An answer runs once the dialog has gone, as `ActionSheet`'s do: most of them
 * navigate or open another modal, and presenting one while this native modal
 * is still leaving is how iOS ends up presenting nothing.
 */
export function Dialog({
  visible,
  onClose,
  title,
  description,
  actions,
  cancelLabel,
}: DialogProps) {
  const overlay = useOverlayInsets()
  const [working, setWorking] = useState<string | null>(null)
  const queued = useRef<DialogAction['onPress'] | null>(null)
  // What it showed while open, kept while it fades. Callers clear the thing a
  // dialog is about as it closes, and the title went blank mid-fade.
  const shown = useHeld({ title, description, actions }, visible)

  const runQueued = () => {
    const run = queued.current
    queued.current = null
    // A failure is the caller's to show; here it is only kept from surfacing as
    // an unhandled rejection.
    Promise.resolve(run?.()).catch((error) => console.warn('[dialog] answer failed', error))
  }

  // Android has no `onDismiss`; its modal is gone once `visible` is false.
  useEffect(() => {
    if (!visible && Platform.OS !== 'ios') runQueued()
  })

  const answer = async (action: DialogAction) => {
    if (!action.waits) {
      queued.current = action.onPress
      onClose()
      return
    }
    setWorking(action.key)
    try {
      await action.onPress()
      onClose()
    } catch {
      // The caller says what went wrong; consuming the rejection keeps it from
      // surfacing as an unhandled promise.
    } finally {
      setWorking(null)
    }
  }
  const pending = working !== null
  const dismiss = pending ? () => undefined : onClose

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
      onDismiss={runQueued}
    >
      <View
        className="flex-1 items-center justify-center"
        // In the strip of the window an overlay belongs in, which is the whole
        // window on a phone. See `overlayInsets`.
        style={{ paddingLeft: overlay.left + 24, paddingRight: overlay.right + 24 }}
      >
        <Pressable
          className="absolute inset-0 bg-black/45"
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          disabled={pending}
        />
        <View
          className="w-full max-w-[360px] gap-5 rounded-card bg-surface px-5 pb-5 pt-6"
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          <View className="gap-2">
            <Text variant="subtitle" className="text-center">
              {shown.title}
            </Text>
            {shown.description ? (
              <Text variant="body" className="text-center text-muted">
                {shown.description}
              </Text>
            ) : null}
          </View>
          <View className="gap-2.5">
            {shown.actions.map((action, index) => (
              <Button
                key={action.key}
                fullWidth
                variant={action.tone ?? (index === 0 ? 'primary' : 'secondary')}
                loading={working === action.key}
                disabled={pending}
                onPress={() => void answer(action)}
              >
                {action.label}
              </Button>
            ))}
            <Button fullWidth variant="ghost" disabled={pending} onPress={onClose}>
              {cancelLabel}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  )
}
