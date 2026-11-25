import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useTheme } from '@/theme/useTheme'
import { Text } from '@/ui'

/**
 * Grams at a tenth below ten and whole above, which is what the figure is worth:
 * "0.5" of protein in a sauce is information, "52.3" of carbs is noise.
 */
const gramsFigure = (value: number) =>
  value >= 10 ? Math.round(value).toLocaleString() : String(Math.round(value * 10) / 10)

/**
 * Each macro's colour as text. The bars' own fills are too pale to read as
 * type, so each takes its readable shade. Carbs is the odd one: `kaya-ink` is
 * the yellow itself in dark mode but a near-black brown in light, where the
 * figure takes the kaya slab's amber instead.
 */
const MACROS = [
  { key: 'carbs', light: 'text-kaya-slab', dark: 'text-kaya-ink' },
  { key: 'protein', light: 'text-hibiscus-ink', dark: 'text-hibiscus-ink' },
  { key: 'fat', light: 'text-teh-ink', dark: 'text-teh-ink' },
] as const

/**
 * Carbs, protein and fat as three figures in the macro bars' colours, held in
 * one small capsule with hairlines between them: "200 g  ( 0 | 40 | 18 )". The
 * colours are the key, so a row carries no names and no repeated "g". `named`
 * spells them out once, for a total with no bars beside it.
 *
 * One capsule rather than dots or a dotted run: the three figures are one
 * thing, read together, and a run of "0 · 40 · 18" read like a list of
 * unrelated numbers.
 *
 * One accessible element that says the names in full, since a colour says
 * nothing to a screen reader.
 */
export function MacroFigures({
  carbs,
  protein,
  fat,
  lead,
  named = false,
}: {
  carbs: number
  protein: number
  fat: number
  /** What the line starts with, the part's amount: "200 g". */
  lead?: string
  named?: boolean
}) {
  const { t } = useTranslation('common')
  const { isDark } = useTheme()
  const values = { carbs, protein, fat }
  const grams = (key: keyof typeof values) => t('unit.grams', { value: gramsFigure(values[key]) })
  const spoken = MACROS.map((m) => `${t(`macro.${m.key}`)} ${grams(m.key)}`).join(', ')

  return (
    <View
      accessible
      accessibilityLabel={lead ? `${lead}, ${spoken}` : spoken}
      className="flex-row flex-wrap items-center gap-x-2 gap-y-1"
    >
      {lead ? <Text variant="meta">{lead}</Text> : null}
      <View className="flex-row items-center rounded-full bg-track px-1">
        {MACROS.map((m, index) => (
          <Fragment key={m.key}>
            {index > 0 ? <View className="my-1 w-[1.5px] self-stretch bg-surface" /> : null}
            <Text variant="caption" className="px-2 py-0.5">
              {named ? `${t(`macro.${m.key}`)} ` : ''}
              <Text variant="caption" className={isDark ? m.dark : m.light}>
                {named ? grams(m.key) : gramsFigure(values[m.key])}
              </Text>
            </Text>
          </Fragment>
        ))}
      </View>
    </View>
  )
}
