import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/theme/useTheme'
import { cn, Text } from '@/ui'

/**
 * Grams at a tenth below ten and whole above, which is what the figure is worth:
 * "0.5" of protein in a sauce is information, "52.3" of carbs is noise.
 */
const gramsFigure = (value: number) =>
  value >= 10 ? Math.round(value).toLocaleString() : String(Math.round(value * 10) / 10)

/**
 * Each macro's colour as text. The bars' own fills are too pale to read as
 * type on a white card, so each takes its readable shade. Carbs is the odd one:
 * `kaya-ink` is the yellow itself in dark mode but a near-black brown in light,
 * where the yellow figure is the kaya slab's amber instead.
 */
const MACROS = [
  { key: 'carbs', light: 'text-kaya-slab', dark: 'text-kaya-ink' },
  { key: 'protein', light: 'text-hibiscus-ink', dark: 'text-hibiscus-ink' },
  { key: 'fat', light: 'text-teh-ink', dark: 'text-teh-ink' },
] as const

/**
 * Carbs, protein and fat as three figures in the macro bars' own colours, one
 * short run of text: "200 g · 0 · 40 · 18". The colours are the key, so a row
 * carries no names, no dots and no repeated "g". `named` spells them out once
 * ("Carbs 93g · Protein 47g · Fat 26g"), for a total with no bars beside it.
 *
 * It was three dots with grams under every part, and a five-part plate read as
 * a table. This is what is left when that is cut to the figures.
 *
 * One run, so it wraps like a sentence, and one accessible element that says
 * the names in full, since a colour says nothing to a screen reader.
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
  /** What the run starts with, the part's amount: "200 g". */
  lead?: string
  named?: boolean
}) {
  const { t } = useTranslation('common')
  const { isDark } = useTheme()
  const values = { carbs, protein, fat }
  const grams = (key: keyof typeof values) => t('unit.grams', { value: gramsFigure(values[key]) })
  const spoken = MACROS.map((m) => `${t(`macro.${m.key}`)} ${grams(m.key)}`).join(', ')

  return (
    <Text variant="meta" accessibilityLabel={lead ? `${lead}, ${spoken}` : spoken}>
      {lead ? `${lead} · ` : ''}
      {MACROS.map((m, index) => (
        <Fragment key={m.key}>
          {index > 0 ? ' · ' : ''}
          {named ? `${t(`macro.${m.key}`)} ` : ''}
          <Text variant="meta" className={cn('font-body-black', isDark ? m.dark : m.light)}>
            {named ? grams(m.key) : gramsFigure(values[m.key])}
          </Text>
        </Fragment>
      ))}
    </Text>
  )
}
