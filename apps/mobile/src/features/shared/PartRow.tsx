import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { Icon, IconButton, Text } from '@/ui'
import { SwipeRow } from './SwipeRow'

export type PartRowProps = {
  /** For the labels of every control on the row. */
  name: string
  /** The line the row leads with: the name, or the count and the name. */
  title: ReactNode
  kcal: number
  /** What a screen reader says for the Delete action. */
  removeLabel: string
  onReplace: () => void
  onRemove: () => void
  /** Null where the amount cannot go further that way. */
  onLess: (() => void) | null
  onMore: (() => void) | null
  /** The amount itself, between the two buttons. */
  children: ReactNode
}

/**
 * One part of a plate or a pot, a line in its card: the amount edited in place,
 * Replace and Delete behind a deliberate swipe. The plate editor on an entry and
 * the ingredient editor on a recipe draw the same row, so they read alike.
 *
 * Replace nearest the row and Delete outermost: the destructive one belongs at
 * the end of the drag, which is where a long swipe puts the thumb and where iOS
 * has taught people to expect it. The minus stops at the smallest amount rather
 * than removing the row; a part deleted by a tap that looks like the twenty
 * before it is why removal moved to the swipe.
 */
export function PartRow({
  name,
  title,
  kcal,
  removeLabel,
  onReplace,
  onRemove,
  onLess,
  onMore,
  children,
}: PartRowProps) {
  const { t } = useTranslation(['logging', 'common'])
  const colors = useThemeColors()
  return (
    <SwipeRow
      square
      actions={[
        {
          label: t('logging:detail.replacePart'),
          a11yLabel: t('logging:detail.replaceOf', { name }),
          icon: 'swap',
          tone: 'water',
          onPress: onReplace,
        },
        {
          label: t('common:action.delete'),
          a11yLabel: removeLabel,
          icon: 'delete',
          tone: 'hibiscus',
          exits: true,
          onPress: onRemove,
        },
      ]}
    >
      {/* Opaque, because the buttons are underneath: the row slides over them
          and anything see-through would show a bin through the part's name. */}
      <View className="gap-2 bg-surface px-card py-md">
        {/* The name on a line of its own, with the whole width to wrap into.
            Beside the controls it had about half the row. */}
        {title}

        <View className="flex-row items-center justify-between gap-3">
          {/* What it costs. The amount is in the field between the buttons,
              because reading it two inches from the control that changes it is
              how the old card ended up truncating its names. */}
          <Text variant="meta" className="min-w-0 flex-1">
            {t('logging:detail.partKcal', { kcal: kcal.toLocaleString() })}
          </Text>

          <View className="flex-row items-center gap-2">
            <IconButton
              size="sm"
              variant="neutral"
              accessibilityLabel={t('logging:detail.lessOf', { name })}
              disabled={onLess === null}
              onPress={() => onLess?.()}
            >
              <Icon set="ui" name="minus" size={16} tintColor={colors.ink} />
            </IconButton>

            {children}

            <IconButton
              size="sm"
              variant="neutral"
              accessibilityLabel={t('logging:detail.moreOf', { name })}
              disabled={onMore === null}
              onPress={() => onMore?.()}
            >
              <Icon set="ui" name="plus" size={16} tintColor={colors.ink} />
            </IconButton>
          </View>
        </View>
      </View>
    </SwipeRow>
  )
}
