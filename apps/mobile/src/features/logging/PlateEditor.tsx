import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput, View } from 'react-native'

import type { EntryIngredient } from '@/data'
import { titleCase } from '@/lib/portions'
import { useThemeColors } from '@/theme/useTheme'
import { Button, cn, Divider, Icon, IconButton, Text, useNumpadField } from '@/ui'
import { PartLine } from './PartLine'
import {
  PART_MAX,
  PART_STEP,
  type PartEdits,
  perUnitGrams,
  quantityForGrams,
  stagedParts,
  stepGrams,
  stepPart,
} from './parts'

/**
 * One part's weight, typed where it is read.
 *
 * A bare `TextInput` rather than a `TextField`, because this sits between two
 * 44pt buttons in a list row: the bordered box, the label above it and the hint
 * below would make every ingredient three times as tall. The dashed rule under
 * the number is what says it can be typed into, the same thing `Stepper` does
 * with its own figure.
 *
 * The value is committed on BLUR rather than per keystroke. Each key would
 * otherwise be a quantity written into the staged overlay and a whole plate
 * re-priced under the finger — and "20" passes through "2" on its way, which for
 * a moment is a different meal.
 */
function GramsField({
  grams,
  label,
  onChange,
}: {
  grams: number
  label: string
  onChange: (next: number) => void
}) {
  const colors = useThemeColors()
  const { t } = useTranslation('logging')
  /** What is in the field while it is being typed, and `null` when it is not. */
  const [typed, setTyped] = useState<string | null>(null)

  const commit = () => {
    const raw = (typed ?? '').replace(',', '.').trim()
    const parsed = Number(raw)
    setTyped(null)
    // An empty or unreadable field keeps the weight it had. `Number('')` is 0,
    // so the empty case has to be caught by hand — and a part weighing nothing
    // is a part that should have been removed rather than resized.
    if (!raw || !Number.isFinite(parsed) || parsed <= 0) return
    onChange(parsed)
  }

  const numpad = useNumpadField({
    value: typed ?? '',
    onChangeText: setTyped,
    // Whole grams. A tenth of a gram of rice is a precision nobody has about a
    // plate, and the row cannot store it anyway.
    decimal: false,
    maxLength: 5,
    label: `${label} · ${t('detail.gramsField')}`,
    // Focus empties the box and the old weight becomes its placeholder, for the
    // reason `Stepper` gives: where a programmatic selection lands on the frame
    // it is focused is the platform's business, and typing over the whole number
    // is what somebody reaching for this wants anyway.
    onFocus: () => setTyped(''),
    onBlur: commit,
    returnKeyType: 'done',
  })

  return (
    <TextInput
      value={typed ?? t('detail.gramsShort', { grams: grams.toLocaleString() })}
      onChangeText={setTyped}
      onSubmitEditing={commit}
      placeholder={typed === '' ? String(grams) : undefined}
      placeholderTextColor={colors.faint}
      // Does nothing while the app's own pad is up, and is the fallback if a
      // platform ever declines to suppress the keyboard.
      keyboardType="number-pad"
      underlineColorAndroid="transparent"
      accessibilityLabel={label}
      className={cn(
        'w-[70px] border-b-2 pb-0.5 text-center font-body-black text-[15px] text-ink',
        typed === null ? 'border-line border-dashed' : 'border-pandan',
      )}
      style={{ paddingVertical: 0 }}
      cursorColor={colors.pandan}
      selectionColor={colors.pandan}
      {...numpad}
    />
  )
}

export type PlateEditorProps = {
  /** The plate as it stands. The staging below is laid over this. */
  ingredients: readonly EntryIngredient[]
  /**
   * Writes the staged changes. Throws to leave the page as it is with the draft
   * still in it; resolves and the host navigates away.
   */
  onSave: (next: PartEdits) => Promise<void>
  /** Said when the write failed. The page stays where it is. */
  onError: () => void
  /**
   * Put a new food on the plate. The host owns the catalogue search.
   *
   * IN HERE RATHER THAN ON THE CARD THAT LEADS TO THIS PAGE. Adding a part and
   * resizing one are the same job — "what was actually on this plate" — and
   * splitting them across a card header and an editor made the header carry two
   * glyphs for one question.
   */
  onAdd: () => void
}

/**
 * Edit the plate: how much of each part of a meal there was, and what else was on
 * it. Saves one part at a time, because `set_ingredient_quantity` takes one
 * ingredient; the taps are free and only Save is a round trip.
 *
 * That function leaves the parent row alone (see
 * `34_food_log_ingredients.sql`), and the entry's totals follow the parts
 * anyway, because `food_log_details` sums them whenever an entry has any.
 *
 * The body of a page, where it was a sheet. Adding a part means leaving for a
 * catalogue search, so as a sheet this had to dismiss itself and be reopened by
 * the host: that works when a food is picked and drops the user past the editor
 * on every other way out. The search is a sheet on the page instead.
 *
 * A route also mounts fresh, where a `Sheet` stays in the tree with
 * `visible={false}` and had to re-seed the draft on every opening.
 */
export function PlateEditor({ ingredients, onSave, onError, onAdd }: PlateEditorProps) {
  const { t } = useTranslation(['logging', 'common'])
  const colors = useThemeColors()

  /**
   * The staging, until Save.
   *
   * An overlay keyed by ingredient id rather than a copy of the list, so a
   * refetch landing mid-edit — the one an added part triggers — cannot silently
   * drop a staged change. See `PartEdits`.
   */
  const [draft, setDraft] = useState<PartEdits>({})
  const [saving, setSaving] = useState(false)

  const parts = stagedParts(ingredients, draft)

  /**
   * A tap on the plus or the minus, IN GRAMS wherever grams are known.
   *
   * The overlay is still a quantity, because that is what the row stores and what
   * `set_ingredient_quantity` takes — the grams are a face on it. See
   * `quantityForGrams` for what that costs at the edges.
   *
   * A part nobody weighed keeps the multiplier: there is no weight to move, and
   * "× 2" is the only thing that can be said about how much of it there was.
   */
  const step = (ingredient: EntryIngredient, direction: 1 | -1) => {
    const perUnit = perUnitGrams(ingredient)
    const next =
      perUnit === null || ingredient.grams === null
        ? stepPart(ingredient.quantity, direction)
        : (() => {
            const grams = stepGrams(ingredient.grams, perUnit, direction)
            return grams === null ? null : quantityForGrams(grams, perUnit)
          })()
    setDraft((current) => ({ ...current, [ingredient.id]: next }))
  }

  /**
   * A weight typed in by hand, which is the precise way to answer "it was more
   * like 200 g". The buttons are the nudge.
   */
  const setGrams = (ingredient: EntryIngredient, grams: number) => {
    const perUnit = perUnitGrams(ingredient)
    if (perUnit === null) return
    setDraft((current) => ({ ...current, [ingredient.id]: quantityForGrams(grams, perUnit) }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await onSave(draft)
    } catch {
      // The page stays, with the draft still in it, so nothing typed is lost to
      // a failed round trip. The host is what leaves on success.
      onError()
      setSaving(false)
    }
  }

  return (
    <>
      {parts.map((ingredient, index) => {
        const perUnit = perUnitGrams(ingredient)
        const weighed = perUnit !== null && ingredient.grams !== null
        // At the smallest amount the minus takes the whole thing off the plate:
        // a quarter of a thing and "there wasn't any" are different answers, and
        // only one of them used to be reachable. The floor is the same either
        // way — a quarter of one unit — said in whichever unit the row is in.
        const atFloor = ingredient.quantity <= PART_STEP
        const atCeiling = ingredient.quantity >= PART_MAX

        return (
          <View key={ingredient.id} className="gap-2">
            {index > 0 ? <Divider /> : null}

            {/* The name on a line of its own, with the whole width to wrap into.
                Beside the controls it had about half the row, which is what this
                sheet exists to give back.

                THE COUNT LEADS IT, the same cart line the ingredient card shows,
                and this is where it has room: under the weight field it would be
                a name wrapping inside a 70pt column between two buttons. It moves
                as the weight does — the buttons and the field below set grams,
                and this is those grams read back as a number of the thing. */}
            <PartLine quantity={ingredient.quantity} name={ingredient.name} variant="bodyStrong" />

            <View className="flex-row items-center justify-between gap-3">
              {/* What it costs. The amount used to be here too and has moved to
                  the field between the buttons, because the amount is the thing
                  being edited and reading it two inches from the control that
                  changes it is how the old card ended up truncating its names. */}
              <Text variant="meta" className="min-w-0 flex-1">
                {t('logging:detail.partKcal', { kcal: ingredient.kcal.toLocaleString() })}
              </Text>

              <View className="flex-row items-center gap-2">
                <IconButton
                  size="sm"
                  variant="neutral"
                  accessibilityLabel={t(
                    atFloor ? 'logging:detail.removeOf' : 'logging:detail.lessOf',
                    { name: ingredient.name },
                  )}
                  onPress={() => step(ingredient, -1)}
                >
                  <Icon
                    set="ui"
                    name={atFloor ? 'delete' : 'minus'}
                    size={16}
                    tintColor={atFloor ? colors.hibiscusInk : colors.ink}
                  />
                </IconButton>

                {/* THE AMOUNT, IN GRAMS, AND IT IS A FIELD.
                    A weight is the one thing about a part somebody can check
                    against the plate in front of them, and "it was more like 200"
                    is a sentence the buttons answer ten grams at a time. Typed on
                    the app's own pad, which a capped `Sheet` makes room for.

                    A part nobody weighed keeps its multiplier and keeps it
                    read-only: there is no weight to type, and a count is what the
                    buttons move. */}
                {weighed ? (
                  /* THE WEIGHT, EXACT, and the count that reads it back is in the
                     heading above. Typing 200 g of something that comes in 180 g
                     pieces leaves this reading 200 and the heading reading "~1 ×".
                     Snapping the weight to the quarter instead would make the two
                     always agree and this field useless: the buttons move 10 g at
                     a time and every one of those taps would round straight back
                     to where it started. */
                  <GramsField
                    grams={Math.round(ingredient.grams ?? 0)}
                    label={titleCase(ingredient.name)}
                    onChange={(grams) => setGrams(ingredient, grams)}
                  />
                ) : (
                  <Text variant="label" className="w-[70px] text-center">
                    {t('logging:detail.times', { amount: ingredient.quantity })}
                  </Text>
                )}

                <IconButton
                  size="sm"
                  variant="neutral"
                  accessibilityLabel={t('logging:detail.moreOf', { name: ingredient.name })}
                  disabled={atCeiling}
                  onPress={() => step(ingredient, 1)}
                >
                  <Icon set="ui" name="plus" size={16} tintColor={colors.ink} />
                </IconButton>
              </View>
            </View>
          </View>
        )
      })}

      {/* Nothing on the plate, and the two ways to arrive there read differently.
          An entry that never had a breakdown is being offered one; a plate whose
          parts have all been taken off is being told what that will cost, which
          is nothing — `food_log_details` falls back to the entry's own portion —
          so it says what will happen rather than blocking the way out. */}
      {parts.length === 0 ? (
        <Text variant="body">
          {t(ingredients.length === 0 ? 'logging:detail.plateNone' : 'logging:detail.plateEmptied')}
        </Text>
      ) : null}

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

      {/* THE WAY TO PUT SOMETHING ON, under the list it adds to. It raises the
          catalogue search over this page, so a plate is built and resized
          without going anywhere.

          Secondary, and above Save, because the two are different kinds of
          thing: this one opens something and Save is what finishes here. */}
      <Button variant="secondary" fullWidth disabled={saving} onPress={onAdd}>
        {t('logging:detail.addPart')}
      </Button>

      {/* After the rows rather than in the screen's footer, which is where a
          page's action usually goes: the weight is typed on the app's own pad,
          and a pinned footer lands behind the keys exactly as it did when this
          was a capped sheet.

          Absent with nothing to write. An entry with no breakdown yet has
          exactly one thing to offer, and a Save that would leave having changed
          nothing is a second button competing with the one that does
          something. */}
      {ingredients.length ? (
        <Button fullWidth loading={saving} onPress={() => void save()}>
          {t('logging:detail.save')}
        </Button>
      ) : null}
    </>
  )
}
