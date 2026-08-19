import { FREE_DAILY_SCANS, FREE_PHOTO_RETENTION_DAYS, FREE_RECIPES } from '@ricecal/shared'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { Card, Divider, Icon, Text } from '@/ui'

/**
 * What each tier gets, row by row.
 *
 * A TWO-COLUMN TABLE, WHICH IT COULD NOT BE BEFORE. This was a single list of
 * everything Pro includes, and the note above it said a comparison table would
 * have an empty column and an argument to make — which was true while there was
 * no free tier: every row would have read "no" on one side, and a page whose
 * left column is a wall of crosses is a page that sells nothing.
 *
 * There is a free tier now, and it can keep a diary: a photographed plate three
 * times a day, the barcode scanner, the whole food database, three recipes, the
 * week's trends, the newest review. So most of this table's left column is a
 * tick, and the rows where it is not are the ones worth paying for. That is the
 * argument, and only the table can make it — a list of what Pro includes cannot
 * say which of it you already have.
 *
 * ORDERED BY USE, not by what is gated. The four ways a meal gets in, then what
 * the app does with it, then what it does over time. A table sorted to put the
 * crosses at the top would read as a list of complaints.
 *
 * `as const` so each `key` stays a literal: widened to `string`, the copy
 * lookups stop typechecking, and a row added without copy would ship as a blank
 * line rather than failing the build.
 */
export const PLAN_FEATURES = [
  // 'text' on both sides: three a day against unlimited is the whole offer, and
  // a tick in both columns would hide it.
  { key: 'snap', free: 'text', pro: 'text' },
  { key: 'describe', free: 'no', pro: 'yes' },
  { key: 'barcode', free: 'yes', pro: 'yes' },
  { key: 'search', free: 'yes', pro: 'yes' },
  { key: 'fix', free: 'no', pro: 'yes' },
  { key: 'suggest', free: 'no', pro: 'yes' },
  { key: 'recipes', free: 'text', pro: 'text' },
  { key: 'recipeFill', free: 'no', pro: 'yes' },
  { key: 'budget', free: 'yes', pro: 'yes' },
  { key: 'health', free: 'yes', pro: 'yes' },
  { key: 'reminders', free: 'yes', pro: 'yes' },
  { key: 'trends', free: 'text', pro: 'text' },
  { key: 'reviews', free: 'text', pro: 'text' },
  { key: 'photos', free: 'text', pro: 'text' },
] as const satisfies ReadonlyArray<{
  key: string
  free: 'yes' | 'no' | 'text'
  pro: 'yes' | 'no' | 'text'
}>

export type PlanFeature = (typeof PLAN_FEATURES)[number]

/** How wide each value column is. Enough for "Unlimited" on one line. */
const COLUMN = 78

export function PlanTable() {
  const { t } = useTranslation('paywall')
  const colors = useThemeColors()

  /**
   * Handed to every row, whether or not its copy has a slot for them.
   *
   * The alternative is a per-row map of which numbers that row needs, which is
   * a second place to keep in step with the copy — and the failure mode of
   * getting it wrong is a cell reading "{{scans}} a day" on a paywall.
   */
  const limits = {
    scans: FREE_DAILY_SCANS,
    recipes: FREE_RECIPES,
    days: FREE_PHOTO_RETENTION_DAYS,
  }

  return (
    <Card title={t('table.title')} contentClassName="gap-0 p-card">
      <View className="flex-row items-end gap-2 pb-2">
        <View className="flex-1" />
        <Text variant="overlineSm" style={{ width: COLUMN }} className="text-center">
          {t('table.free')}
        </Text>
        {/* The one coloured thing in the header, because it is the column being
            sold. Everything below it stays in the ordinary ink: a table where
            the right-hand side is tinted throughout reads as a highlight rather
            than as a comparison. */}
        <Text
          variant="overlineSm"
          style={{ width: COLUMN }}
          className="text-center text-pandan-ink"
        >
          {t('table.pro')}
        </Text>
      </View>
      <Divider />

      {PLAN_FEATURES.map((feature, index) => (
        <View key={feature.key}>
          <View className="flex-row items-center gap-2 py-2.5">
            <Text variant="meta" className="flex-1 text-ink">
              {t(`table.rows.${feature.key}.label`)}
            </Text>
            <Cell
              kind={feature.free}
              label={t(`table.rows.${feature.key}.free`, limits)}
              tint={colors.muted}
            />
            <Cell
              kind={feature.pro}
              label={t(`table.rows.${feature.key}.pro`, limits)}
              tint={colors.pandanInk}
            />
          </View>
          {index < PLAN_FEATURES.length - 1 ? <Divider /> : null}
        </View>
      ))}
    </Card>
  )
}

/**
 * One value: a tick, a dash, or a few words.
 *
 * THE FREE TICK IS MUTED AND NOT FAINT. Faint is the app's lightest grey and it
 * reads as disabled — which is the wrong thing to say about a feature somebody
 * already has, on the one column whose job is to look like a working app.
 *
 * A DASH RATHER THAN A CROSS for "not included". A cross is a mark against the
 * thing beside it, and this column is not a list of the free tier's failings —
 * it is what somebody already has. The dash is the same symbol a stat tile uses
 * for a missing reading, which is the app's existing word for "nothing here".
 */
function Cell({ kind, label, tint }: { kind: 'yes' | 'no' | 'text'; label: string; tint: string }) {
  return (
    <View style={{ width: COLUMN }} className="items-center">
      {kind === 'yes' ? (
        <Icon set="ui" name="check" size={18} tintColor={tint} />
      ) : kind === 'no' ? (
        <Text variant="meta" className="text-faint">
          —
        </Text>
      ) : (
        <Text variant="caption" className="text-center text-ink">
          {label}
        </Text>
      )}
    </View>
  )
}
