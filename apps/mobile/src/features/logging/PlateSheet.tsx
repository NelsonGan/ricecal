import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { EntryIngredient } from '@/data'
import { titleCase } from '@/lib/portions'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Divider, Icon, IconButton, Sheet, Text } from '@/ui'
import { PART_MAX, PART_STEP, type PartEdits, stagedParts, stepPart } from './parts'

export type PlateSheetProps = {
  visible: boolean
  onClose: () => void
  /** The plate as the scan left it. The staging below is laid over this. */
  ingredients: readonly EntryIngredient[]
  /** What is staged on the screen behind, which is what this opens on. */
  edits: PartEdits
  /** Writes them. Throws to leave the sheet open with the draft still in it. */
  onSave: (next: PartEdits) => Promise<void>
  /** Said when the write failed. The sheet stays where it is. */
  onError: () => void
}

/**
 * EDIT THE PLATE: how much of each part of a scanned meal there was.
 *
 * The steppers used to sit on the detail screen's ingredient card, and moving
 * them here is what let that card show a part's whole name. Two buttons and a
 * calorie figure took about half the row, so every name longer than "Fried
 * chicken" was truncated on the one screen whose job is checking what the model
 * decided the plate was made of.
 *
 * IT SAVES ITSELF, one part at a time, because `set_ingredient_quantity` takes one
 * ingredient. The taps in here are free; only Save is a round trip.
 *
 * That function leaves the PARENT ROW alone, and the note in
 * `34_food_log_ingredients.sql` says why it stopped rescaling it: scaling a parent
 * moves all four of its macros together. The entry's totals follow the parts
 * anyway, because `food_log_details` sums them whenever an entry has any.
 *
 * A CAPPED sheet with a footer, unlike the other two on this screen: there is no
 * text field in here, so no keyboard to pad the panel up off the bottom edge,
 * and the action row belongs pinned under the list rather than scrolling with
 * it.
 */
export function PlateSheet({
  visible,
  onClose,
  ingredients,
  edits,
  onSave,
  onError,
}: PlateSheetProps) {
  const { t } = useTranslation(['logging', 'common'])
  const colors = useThemeColors()

  /**
   * The staging, while the sheet is open.
   *
   * Seeded from the screen every time it opens rather than only at mount: a
   * `Sheet` is a `Modal` that stays in the tree with `visible={false}`, so the
   * state here outlives one opening. Without this, a plate edited, discarded and
   * opened again would show the discarded edits.
   *
   * `NutritionSheet` gets the same effect for free by mounting its form only
   * while the sheet is up. This one cannot: the Done button is in the sheet's
   * FOOTER, which is outside the body, so the draft has to live above both.
   */
  const [draft, setDraft] = useState(edits)
  const [saving, setSaving] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: opening is the seed, not `edits` changing
  useEffect(() => {
    if (!visible) return
    setDraft(edits)
    // AND the spinner, which does not reset itself here. A successful save closes
    // the sheet without unmounting this component — a `Modal` stays in the tree
    // with `visible={false}` — so `saving` stayed true, and the second time the
    // sheet was opened its button was already disabled and could not be pressed.
    // The sheets that mount their form only while open get this for free.
    setSaving(false)
  }, [visible])

  const parts = stagedParts(ingredients, draft)

  const step = (id: string, quantity: number, direction: 1 | -1) => {
    setDraft((current) => ({ ...current, [id]: stepPart(quantity, direction) }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await onSave(draft)
    } catch {
      onError()
      setSaving(false)
      return
    }
    onClose()
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      /* NO TITLE AND NO DESCRIPTION. The rows are the ingredients by name with a
         pair of buttons each and a total under them, opened from a pencil on a
         card headed INGREDIENTS — a heading asking "How much of each?" and a
         line explaining that nothing is saved yet were two sentences saying what
         the controls already say. */
      closeLabel={t('common:action.close')}
      footer={
        <Button fullWidth loading={saving} onPress={() => void save()}>
          {t('logging:detail.save')}
        </Button>
      }
    >
      {parts.map((ingredient, index) => {
        // At the smallest amount the minus takes the whole thing off the plate.
        // See `stepPart`: a quarter of a thing and "there wasn't any" are
        // different answers, and only one of them used to be reachable.
        const atFloor = ingredient.quantity <= PART_STEP

        return (
          <View key={ingredient.id} className="gap-2">
            {index > 0 ? <Divider /> : null}

            {/* The name on a line of its own, with the whole width to wrap into.
                Beside the controls it had about half the row, which is what this
                sheet exists to give back. */}
            <Text variant="bodyStrong">{titleCase(ingredient.name)}</Text>

            <View className="flex-row items-center justify-between gap-3">
              {/* The count, what it weighs and what it costs: the three facts
                  the buttons to the right are moving. The weight is absent where
                  the scan did not weigh the part, since "0 g" would be a claim
                  about the food rather than about the answer. */}
              <Text variant="meta" className="min-w-0 flex-1">
                {ingredient.grams
                  ? t('logging:detail.timesWeightKcal', {
                      amount: ingredient.quantity,
                      grams: Math.round(ingredient.grams).toLocaleString(),
                      kcal: ingredient.kcal.toLocaleString(),
                    })
                  : t('logging:detail.timesKcal', {
                      amount: ingredient.quantity,
                      kcal: ingredient.kcal.toLocaleString(),
                    })}
              </Text>

              <View className="flex-row items-center gap-2">
                <IconButton
                  size="sm"
                  variant="neutral"
                  accessibilityLabel={t(
                    atFloor ? 'logging:detail.removeOf' : 'logging:detail.lessOf',
                    { name: ingredient.name },
                  )}
                  onPress={() => step(ingredient.id, ingredient.quantity, -1)}
                >
                  <Icon
                    set="ui"
                    name={atFloor ? 'delete' : 'minus'}
                    size={16}
                    tintColor={atFloor ? colors.hibiscusInk : colors.ink}
                  />
                </IconButton>
                <IconButton
                  size="sm"
                  variant="neutral"
                  accessibilityLabel={t('logging:detail.moreOf', { name: ingredient.name })}
                  disabled={ingredient.quantity >= PART_MAX}
                  onPress={() => step(ingredient.id, ingredient.quantity, 1)}
                >
                  <Icon set="ui" name="plus" size={16} tintColor={colors.ink} />
                </IconButton>
              </View>
            </View>
          </View>
        )
      })}

      {/* Every part taken off. The entry survives as whatever its own portion
          costs — `food_log_details` falls back to it when there are no parts
          left — so this says what will happen rather than blocking the way out. */}
      {parts.length === 0 ? <Text variant="body">{t('logging:detail.plateEmptied')}</Text> : null}

      {parts.length ? (
        <>
          <Divider />
          <View className="flex-row items-baseline justify-between gap-3">
            <Text variant="bodyStrong">{t('logging:detail.plateTotal')}</Text>
            <View className="flex-row items-baseline gap-1">
              <Text variant="numeric">
                {parts.reduce((sum, item) => sum + item.kcal, 0).toLocaleString()}
              </Text>
              <Text variant="caption">{t('common:unit.kcal')}</Text>
            </View>
          </View>
        </>
      ) : null}
    </Sheet>
  )
}
