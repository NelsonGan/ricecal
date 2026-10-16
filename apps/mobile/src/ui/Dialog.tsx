import { type ReactNode, useEffect, useRef } from 'react'
import { Modal, Platform, Pressable, View } from 'react-native'

import { Button } from './Button'
import { Text } from './Text'

export type DialogAction = {
  key: string
  label: string
  /** `primary` for the answer most people give, `danger` for one that deletes. */
  tone?: 'primary' | 'secondary' | 'danger'
  icon?: ReactNode
  onPress: () => void | Promise<void>
}

export type DialogProps = {
  visible: boolean
  onClose: () => void
  title: string
  description?: string
  actions: readonly DialogAction[]
  /** The way out without answering. Omit for a question that must be answered. */
  cancelLabel?: string
  /** Shows the first action as working and blocks the rest. */
  pending?: boolean
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
  pending = false,
}: DialogProps) {
  const queued = useRef<DialogAction['onPress'] | null>(null)
  // What it showed while open, kept while it fades. Callers clear the thing a
  // dialog is about as it closes, and the title went blank mid-fade.
  const held = useRef({ title, description, actions })
  if (visible) held.current = { title, description, actions }
  const shown = visible ? { title, description, actions } : held.current

  const runQueued = () => {
    const run = queued.current
    queued.current = null
    void run?.()
  }

  // Android has no `onDismiss`; its modal is gone once `visible` is false.
  useEffect(() => {
    if (!visible && Platform.OS !== 'ios') runQueued()
  })

  const answer = (action: DialogAction) => {
    queued.current = action.onPress
    onClose()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={cancelLabel ? onClose : () => undefined}
      onDismiss={runQueued}
    >
      <View className="flex-1 items-center justify-center px-6">
        <Pressable
          className="absolute inset-0 bg-black/45"
          onPress={cancelLabel ? onClose : undefined}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          disabled={!cancelLabel || pending}
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
                leftIcon={action.icon}
                loading={pending && index === 0}
                disabled={pending}
                onPress={() => answer(action)}
              >
                {action.label}
              </Button>
            ))}
            {cancelLabel ? (
              <Button fullWidth variant="ghost" disabled={pending} onPress={onClose}>
                {cancelLabel}
              </Button>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  )
}
