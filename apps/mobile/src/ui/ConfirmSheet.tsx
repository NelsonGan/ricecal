import { useState } from 'react'
import { View } from 'react-native'

import { Button, type ButtonVariant } from './Button'
import { Sheet } from './Sheet'

export type ConfirmSheetProps = {
  visible: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` for anything that removes data. */
  tone?: Extract<ButtonVariant, 'primary' | 'danger'>
}

/**
 * A yes/no confirmation in a sheet.
 *
 * Awaits `onConfirm` and shows a spinner while it runs, so a confirmation that
 * hits the network cannot be double-tapped and does not close before the write
 * lands. It stays open on rejection — closing on failure would tell the user
 * the thing happened.
 *
 * The destructive action sits on the left in the design's layout, but the sheet
 * is dismissible by scrim tap and back gesture, so the safe way out is always
 * the larger target.
 */
export function ConfirmSheet({
  visible,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Keep',
  tone = 'danger',
}: ConfirmSheetProps) {
  const [pending, setPending] = useState(false)

  const confirm = async () => {
    setPending(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={pending ? () => {} : onClose}
      title={title}
      description={description}
      footer={
        <View className="flex-row gap-3">
          <Button variant={tone} className="flex-1" loading={pending} onPress={confirm}>
            {confirmLabel}
          </Button>
          <Button variant="neutral" className="flex-1" disabled={pending} onPress={onClose}>
            {cancelLabel}
          </Button>
        </View>
      }
    />
  )
}
