import { type ReactNode, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Button, Sheet } from '@/ui'

/**
 * A centred sheet of wheels with Done under them: a rest, a reminder's time,
 * when a workout started. Not scrollable: wheels inside a scroller lose every
 * drag. Done runs `onDone` and closes; `footer` goes under it.
 *
 * `onOpen` sets the wheels before the panel is drawn. The sheet stays mounted
 * between opens, and resetting in `onShow`, which fires once the window is up,
 * showed the last value for a frame before the wheels jumped.
 */
export function WheelSheet({
  visible,
  title,
  onOpen,
  onClose,
  onDone,
  footer,
  children,
}: {
  visible: boolean
  title: string
  onOpen: () => void
  onClose: () => void
  onDone: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation('common')

  // biome-ignore lint/correctness/useExhaustiveDependencies: only on opening
  useLayoutEffect(() => {
    if (visible) onOpen()
  }, [visible])

  return (
    <Sheet
      placement="center"
      visible={visible}
      onClose={onClose}
      closeLabel={t('action.close')}
      title={title}
      scrollable={false}
    >
      <View className="gap-5">
        {children}
        <View className="gap-2">
          <Button
            fullWidth
            onPress={() => {
              onDone()
              onClose()
            }}
          >
            {t('action.done')}
          </Button>
          {footer}
        </View>
      </View>
    </Sheet>
  )
}
