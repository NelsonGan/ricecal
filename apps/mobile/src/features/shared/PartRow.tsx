import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { cn, Icon, IconButton, Tappable, Text } from '@/ui'
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
  /**
   * Null where the amount cannot go further that way. An `inline` row has no
   * buttons and leaves both out.
   */
  onLess?: (() => void) | null
  onMore?: (() => void) | null
  /** The amount itself, between the two buttons. */
  children: ReactNode
  /**
   * The amount and the two buttons as ONE pill, with the calories on the right.
   * For a row whose amount carries its own unit ("2 tbsp", "1 cup"): three loose
   * controls with a unit floating between them read as four things, and rows
   * with different units did not line up.
   */
  joined?: boolean
  /**
   * A line under the name, beside the calories it explains: what the part
   * brings, on the plate editor. Above the pill rather than beside it, where it
   * fitted some rows and wrapped on others. A joined row only.
   */
  detail?: ReactNode
  /**
   * One line: the name over its calories, and the amount on the right with no
   * minus and plus. For a recipe, whose amounts are measured and typed rather
   * than nudged by eye the way a plate's are.
   */
  inline?: boolean
  /** Before the name on an `inline` row: a recipe line's drawing. */
  leading?: ReactNode
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
  joined = false,
  detail,
  inline = false,
  leading,
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
      {inline ? (
        // No buttons, so the name keeps most of the width beside the amount.
        // As two lines with a full-width pill, seven ingredients filled two
        // screens of the recipe form.
        <View className="flex-row items-center gap-3 bg-surface px-card py-3">
          {leading}
          <View className="min-w-0 flex-1">
            {title}
            <Text variant="meta">
              {t('logging:detail.partKcal', { kcal: kcal.toLocaleString() })}
            </Text>
          </View>
          <View className="max-w-[60%] shrink-0">{children}</View>
        </View>
      ) : (
        <View className="gap-2 bg-surface px-card py-md">
          {/* The name on a line of its own, with the whole width to wrap into.
              Beside the controls it had about half the row. A joined row puts its
              calories here, right-aligned like a list row's value, so the pill
              below has the width a long unit name or a big amount needs. */}
          {joined ? (
            <View className="flex-row items-baseline gap-3">
              <View className="min-w-0 flex-1">{title}</View>
              <Text variant="bodyStrong" className="shrink-0">
                {t('logging:detail.partKcal', { kcal: kcal.toLocaleString() })}
              </Text>
            </View>
          ) : (
            title
          )}

          {joined ? detail : null}

          {joined ? (
            <View className="flex-row">
              <View className="max-w-full flex-row items-stretch overflow-hidden rounded-full border-[3px] border-line bg-surface">
                <Tappable
                  onPress={() => onLess?.()}
                  disabled={onLess === null}
                  accessibilityRole="button"
                  accessibilityLabel={t('logging:detail.lessOf', { name })}
                  accessibilityState={{ disabled: onLess === null }}
                  className={cn(
                    'min-w-[48px] items-center justify-center',
                    onLess === null && 'opacity-40',
                  )}
                >
                  <Icon set="ui" name="minus" size={16} tintColor={colors.ink} />
                </Tappable>
                <View className="min-h-[44px] min-w-[140px] shrink flex-row items-center justify-center gap-2 border-x-[3px] border-line bg-pandan-soft px-3">
                  {children}
                </View>
                <Tappable
                  onPress={() => onMore?.()}
                  disabled={onMore === null}
                  accessibilityRole="button"
                  accessibilityLabel={t('logging:detail.moreOf', { name })}
                  accessibilityState={{ disabled: onMore === null }}
                  className={cn(
                    'min-w-[48px] items-center justify-center',
                    onMore === null && 'opacity-40',
                  )}
                >
                  <Icon set="ui" name="plus" size={16} tintColor={colors.ink} />
                </Tappable>
              </View>
            </View>
          ) : (
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
          )}
        </View>
      )}
    </SwipeRow>
  )
}
