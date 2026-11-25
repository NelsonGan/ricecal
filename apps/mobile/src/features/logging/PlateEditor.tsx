import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput, View } from 'react-native'

import type { EntryIngredient, Units } from '@/data'
import { MacroFigures } from '@/features/shared/MacroFigures'
import { MeasureList, UnitPill } from '@/features/shared/MeasurePicker'
import { PartRow } from '@/features/shared/PartRow'
import { measureFigure, useMeasureText } from '@/features/shared/useMeasureText'
import type { MeasureUnit } from '@/lib/measures'
import { roundHalfUp } from '@/lib/nutrition'
import { formatPortion, titleCase } from '@/lib/portions'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Card, cn, Divider, Sheet, TEXT_SCALES, Text, useNumpadField } from '@/ui'
import { usePartMacros } from './MacrosToggle'
import { PartLine } from './PartLine'
import { type PartEdits, stagedParts, stepPart } from './parts'
import { partUnit, partUnits, quantityIn, shownIn, stepIn } from './partUnits'

/**
 * One part's amount, typed where it is read, in the unit the row is shown in.
 *
 * A bare `TextInput` rather than a `TextField`, because this sits inside the
 * row's pill: the bordered box, the label above it and the hint below would make
 * every ingredient three times as tall. The dashed rule under the number is what
 * says it can be typed into, the same thing `Stepper` does with its own figure.
 *
 * The value is committed on BLUR rather than per keystroke. Each key would
 * otherwise be a quantity written into the staged overlay and a whole plate
 * re-priced under the finger, and "20" passes through "2" on its way, which for
 * a moment is a different meal.
 */
function AmountField({
  figure,
  label,
  whole,
  onChange,
}: {
  /** The amount alone, as the row prints it: "200", "1½". */
  figure: string
  label: string
  /** Grams and millilitres are typed whole; spoons and cups take a decimal. */
  whole: boolean
  onChange: (next: number) => void
}) {
  const colors = useThemeColors()
  /** What is in the field while it is being typed, and `null` when it is not. */
  const [typed, setTyped] = useState<string | null>(null)

  const commit = () => {
    const raw = (typed ?? '').replace(',', '.').trim()
    const parsed = Number(raw)
    setTyped(null)
    // An empty or unreadable field keeps the amount it had. `Number('')` is 0,
    // so the empty case has to be caught by hand, and a part of nothing is a
    // part that should have been removed rather than resized.
    if (!raw || !Number.isFinite(parsed) || parsed <= 0) return
    onChange(parsed)
  }

  const numpad = useNumpadField({
    value: typed ?? '',
    onChangeText: setTyped,
    decimal: !whole,
    maxLength: 5,
    label,
    // Focus empties the box and the old amount becomes its placeholder, for the
    // reason `Stepper` gives: where a programmatic selection lands on the frame
    // it is focused is the platform's business, and typing over the whole number
    // is what somebody reaching for this wants anyway.
    onFocus: () => setTyped(''),
    onBlur: commit,
    returnKeyType: 'done',
  })

  return (
    <TextInput
      allowFontScaling={TEXT_SCALES}
      value={typed ?? figure}
      onChangeText={setTyped}
      onSubmitEditing={commit}
      placeholder={typed === '' ? figure : undefined}
      placeholderTextColor={colors.faint}
      // Does nothing while the app's own pad is up, and is the fallback if a
      // platform ever declines to suppress the keyboard.
      keyboardType={whole ? 'number-pad' : 'decimal-pad'}
      underlineColorAndroid="transparent"
      accessibilityLabel={label}
      className={cn(
        'min-w-[36px] max-w-[72px] border-b-2 pb-0.5 text-center font-body-black text-[17px] text-ink',
        // Pandan, dashed: a line in the old grey disappeared against the pill's
        // mint, and the rule is the only sign the number is typable.
        typed === null ? 'border-pandan border-dashed' : 'border-pandan',
      )}
      style={{ paddingVertical: 0 }}
      cursorColor={colors.pandan}
      selectionColor={colors.pandan}
      {...numpad}
    />
  )
}

/**
 * How long a resized part waits before it is written.
 *
 * The same 500ms the dish's own portion stepper uses, and for the same reason:
 * long enough that "tap tap tap" is one round trip, short enough that letting go
 * does not feel like waiting. See `PORTION_DEBOUNCE_MS` in `log/food/[id].tsx`.
 */
const PLATE_DEBOUNCE_MS = 500

export type PlateEditorProps = {
  /** The plate as it stands. The staging below is laid over this. */
  ingredients: readonly EntryIngredient[]
  /**
   * How much of the plate was eaten, set on the entry's own page. It scales
   * the total and nothing edited here: the parts are the plate as served.
   */
  plateQuantity?: number
  /**
   * Writes whatever has been staged. Called on a debounce as the plate is
   * edited, and once more on the way out; it is handed the whole overlay and
   * works out for itself which parts actually moved.
   *
   * Rejects and the draft stays put, so nothing typed is lost to a failed round
   * trip and the next tap sends it again.
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
  /**
   * Take a part off, from the button a swipe uncovers.
   *
   * Written AT ONCE rather than staged, unlike a resize. A removal is not a
   * value that settles: there is no second half of the gesture to wait for, and
   * a row that has slid away and come back a moment later because a debounce
   * had not fired yet is a row the user cannot trust.
   */
  onRemove: (ingredient: EntryIngredient) => void
  /** Swap a part for a different food. The host owns the catalogue search. */
  onReplace: (ingredient: EntryIngredient) => void
  /**
   * Read a part in another unit: 36 g of soy sauce as 2 tbsp. Moves no amount,
   * so it is written at once rather than staged.
   */
  onUnitChange: (ingredient: EntryIngredient, unit: MeasureUnit) => void
  /** The person's unit system, which decides whether ounces are on offer. */
  units?: Units
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
export function PlateEditor({
  ingredients,
  plateQuantity = 1,
  onSave,
  onError,
  onAdd,
  onRemove,
  onReplace,
  onUnitChange,
  units,
}: PlateEditorProps) {
  const { t } = useTranslation(['logging', 'recipes', 'common'])
  const measureText = useMeasureText()
  const [showMacros] = usePartMacros()
  /** The part whose unit list is open. */
  const [choosing, setChoosing] = useState<EntryIngredient | null>(null)

  /**
   * The staging, between one edit and the write that follows it.
   *
   * An overlay keyed by ingredient id rather than a copy of the list, so a
   * refetch landing mid-edit — the one an added part triggers — cannot silently
   * drop a staged change. See `PartEdits`.
   *
   * It is NOT cleared once a write lands. The overlay and the server agree at
   * that point, so `partChanges` finds nothing in it and there is nothing to
   * clear; emptying it would instead reintroduce the flicker it exists to
   * prevent, because the row would fall back to the fetched figures for the
   * frame before the refetch arrives.
   */
  const [draft, setDraft] = useState<PartEdits>({})

  /**
   * Whether this visit has taken a part off, which is the only thing that still
   * tells the two empty plates apart.
   *
   * `ingredients.length` used to answer it: a removal was staged, so the fetched
   * list still held the row the user had just crossed out. A removal is written
   * at once now, and an emptied plate and an entry that never had a breakdown
   * arrive at the same empty list by different roads. One is being offered a
   * breakdown; the other is being told what emptying it cost, which is nothing.
   */
  const [emptied, setEmptied] = useState(false)

  /**
   * The draft as the timer will find it, the timer itself, and whether anything
   * is actually waiting.
   *
   * The ref rather than the state, because a debounce that closes over the draft
   * it was scheduled with writes the second-to-last edit of a fast sequence.
   */
  const pending = useRef<PartEdits | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /**
   * Send what is waiting, now.
   *
   * Behind a ref that is reassigned on every render, so the timeout scheduled
   * one render ago still calls the current `onSave`.
   */
  const flushRef = useRef(() => {})
  flushRef.current = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = undefined
    const next = pending.current
    pending.current = null
    if (!next) return
    void onSave(next).catch(onError)
  }

  /**
   * ON THE WAY OUT AS WELL, and this is the half a debounce alone gets wrong: a
   * page left within half a second of the last tap would clear its timer on
   * unmount and lose the edit. Leaving is not cancelling.
   */
  useEffect(() => () => flushRef.current(), [])

  const stage = (id: string, quantity: number) => {
    const next = { ...(pending.current ?? draft), [id]: quantity }
    pending.current = next
    setDraft(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => flushRef.current(), PLATE_DEBOUNCE_MS)
  }

  const parts = stagedParts(ingredients, draft)
  const plateKcal = parts.reduce((sum, item) => sum + item.kcal, 0)
  const plateMacros = parts.reduce(
    (sum, item) => ({
      carbs: sum.carbs + item.carbs,
      protein: sum.protein + item.protein,
      fat: sum.fat + item.fat,
    }),
    { carbs: 0, protein: 0, fat: 0 },
  )

  /**
   * Where a tap on the plus or the minus would land this part, in the unit it
   * is read in, and `null` where there is nowhere left to go.
   *
   * Read twice: once to move the part, and once to decide whether the button
   * that moves it should be live at all. Working it out in two places is what
   * once left a minus looking pressable that did nothing.
   *
   * The overlay is still a quantity, because that is what the row stores and
   * what `set_ingredient_quantity` takes: the unit is a face on it. A part with
   * no unit keeps the multiplier, since "× 2" is the only thing that can be
   * said about how much of it there was.
   */
  const stepTarget = (ingredient: EntryIngredient, direction: 1 | -1): number | null => {
    const unit = partUnit(ingredient, units)
    if (unit) return stepIn(ingredient, unit, direction)
    const next = stepPart(ingredient.quantity, direction)
    return next === null || next === ingredient.quantity ? null : next
  }

  const step = (ingredient: EntryIngredient, direction: 1 | -1) => {
    // `null` used to MEAN removal, which was right while a plate was written by
    // a Save button and is not now: the same tap would take a part off the plate
    // outright, half a second later, with nothing asked and nothing to undo.
    // Removal is the swipe.
    const next = stepTarget(ingredient, direction)
    if (next === null) return
    stage(ingredient.id, next)
  }

  /**
   * An amount typed in by hand, which is the precise way to answer "it was
   * more like 200 g". The buttons are the nudge.
   */
  const setAmount = (ingredient: EntryIngredient, unit: MeasureUnit, amount: number) => {
    const next = quantityIn(ingredient, unit, amount)
    if (next !== null) stage(ingredient.id, next)
  }

  /**
   * The parts, as rows of ONE card rather than a tile each.
   *
   * `SwipeRow` rounds its own corners, which is right on Today, where an entry
   * is a tile on the canvas. Here it drew a white pill per ingredient with the
   * dividers floating in the gaps between them, and no side padding at all, so
   * every name started on the pill's own edge. The card owns the corners and
   * the rows are lines in it: `flush` because the swipe has to reach the edge,
   * `gap-0` because the dividers are the spacing.
   */
  const plate = (
    <Card flush contentClassName="gap-0">
      {parts.map((ingredient, index) => {
        const unit = partUnit(ingredient, units)
        const switchable = partUnits(ingredient, units).length > 1
        const amount = unit ? shownIn(ingredient, unit) : 0
        const unitName = unit ? measureText.unit(unit, amount) : ''
        // The minus STOPS at the smallest amount rather than removing the row,
        // which it used to do. With the plate writing itself, that is a part
        // deleted by a tap that looks like the twenty before it. Swiping the row
        // is where removal went.
        const atFloor = stepTarget(ingredient, -1) === null
        const atCeiling = stepTarget(ingredient, 1) === null

        return (
          <View key={ingredient.id}>
            {/* Inset to the text rather than run wall to wall, which is what
                every other list card in the app does, and outside the `SwipeRow`
                so it stays put while the row slides over its buttons. */}
            {index > 0 ? <Divider className="mx-card" /> : null}

            {/* Replace is the answer to a scan that named the right kind of
                thing and the wrong one of it, which used to cost a delete, a
                search and an add. */}
            <PartRow
              name={ingredient.name}
              // THE COUNT LEADS IT, the same cart line the ingredient card shows.
              // It moves as the amount does: the pill sets grams or spoons, and
              // this is that amount read back as a number of the thing.
              title={
                <PartLine
                  quantity={ingredient.quantity}
                  name={ingredient.name}
                  variant="bodyStrong"
                />
              }
              kcal={ingredient.kcal}
              removeLabel={t('logging:detail.removeOf', { name: ingredient.name })}
              onReplace={() => onReplace(ingredient)}
              onRemove={() => {
                setEmptied(true)
                onRemove(ingredient)
              }}
              onLess={atFloor ? null : () => step(ingredient, -1)}
              onMore={atCeiling ? null : () => step(ingredient, 1)}
              joined
              // What the part brings, under the calories it adds up to, when
              // the header's Macros switch asks for it. Coloured figures rather
              // than words on every row: the total names them once.
              detail={
                showMacros ? (
                  <View className="-mt-1">
                    <MacroFigures
                      carbs={ingredient.carbs}
                      protein={ingredient.protein}
                      fat={ingredient.fat}
                    />
                  </View>
                ) : undefined
              }
            >
              {/* THE AMOUNT, IN THE PART'S UNIT, AND IT IS A FIELD.
                  A weight is the one thing about a part somebody can check
                  against the plate in front of them, and a spoon is how a sauce
                  was actually measured. A part with no unit keeps its
                  multiplier, read-only: a count is what the buttons move.

                  Exact, and the count that reads it back is in the heading.
                  Snapping the amount to the quarter instead would make the two
                  always agree and this field useless. */}
              {unit ? (
                <>
                  <AmountField
                    // Keyed on the unit, or a number half-typed in grams
                    // survives into tablespoons.
                    key={unit}
                    figure={measureFigure(unit, amount)}
                    whole={unit === 'g' || unit === 'ml'}
                    label={t('recipes:ingredient.change', {
                      name: titleCase(ingredient.name),
                      measure: measureText.amount(amount, unit),
                    })}
                    onChange={(typed) => setAmount(ingredient, unit, typed)}
                  />
                  {switchable ? (
                    <UnitPill
                      size="sm"
                      label={unitName}
                      onPress={() => setChoosing(ingredient)}
                      accessibilityLabel={t('recipes:ingredient.changeUnit', {
                        name: titleCase(ingredient.name),
                        unit: unitName,
                      })}
                    />
                  ) : (
                    // Not a control when there is nothing to change it to, so
                    // not in the action colour either.
                    <Text className="font-display text-[15px] text-muted leading-[24px]">
                      {unitName}
                    </Text>
                  )}
                </>
              ) : (
                <Text variant="label">
                  {t('logging:detail.times', { amount: formatPortion(ingredient.quantity) })}
                </Text>
              )}
            </PartRow>
          </View>
        )
      })}

      {/* THE SUM, and the last child of the card on purpose. `Squish` clips at
          the container and its surface layer does not, so a filled row here
          would paint square white corners over the slab; this one is
          transparent and takes the card's own corners. */}
      <Divider className="mx-card" />
      <View className="gap-1.5 px-card py-md">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text variant="bodyStrong">{t('logging:detail.plateTotal')}</Text>
          <View className="flex-row items-baseline gap-1">
            <Text variant="numeric">{plateKcal.toLocaleString()}</Text>
            <Text variant="caption">{t('common:unit.kcal')}</Text>
          </View>
        </View>
        {/* The plate's macros, with their names: the key to the colours above. */}
        {showMacros ? (
          <MacroFigures
            carbs={plateMacros.carbs}
            protein={plateMacros.protein}
            fat={plateMacros.fat}
            named
          />
        ) : null}
      </View>
      {/* And what counts of it, when not all of it was eaten. The same line the
          entry's own ingredient card draws, for the same reason: every figure
          above is the plate as served. Tucked under the total rather than given
          its own padding, so the pair reads as one sum. */}
      {plateQuantity === 1 ? null : (
        <View className="-mt-md flex-row items-baseline justify-between gap-3 px-card pb-md">
          <Text variant="bodyStrong">
            {t('logging:detail.times', { amount: formatPortion(plateQuantity) })}
          </Text>
          <View className="flex-row items-baseline gap-1">
            <Text variant="numeric">{roundHalfUp(plateKcal * plateQuantity).toLocaleString()}</Text>
            <Text variant="caption">{t('common:unit.kcal')}</Text>
          </View>
        </View>
      )}

      <Sheet
        visible={choosing !== null}
        onClose={() => setChoosing(null)}
        title={t('recipes:ingredient.unitTitle')}
        closeLabel={t('common:action.close')}
      >
        {choosing ? (
          // Each line says what this part reads as in that unit, so the choice
          // shows its result before it is made. No calories beside them: a
          // unit here moves no amount, so every line would cost the same.
          <MeasureList
            choices={partUnits(choosing, units).map((option) => {
              const current = option === partUnit(choosing, units)
              return {
                key: option,
                title: measureText.amount(shownIn(choosing, option), option),
                selected: current,
                onPress: () => {
                  if (!current) onUnitChange(choosing, option)
                  setChoosing(null)
                },
              }
            })}
          />
        ) : null}
      </Sheet>
    </Card>
  )

  return (
    <>
      {parts.length ? plate : null}

      {/* Nothing on the plate, and the two ways to arrive there read differently.
          An entry that never had a breakdown is being offered one; a plate whose
          parts have all been taken off is being told what that cost, which is
          nothing — `food_log_details` falls back to the entry's own portion — so
          it says what has happened rather than blocking the way out. */}
      {parts.length === 0 ? (
        <Text variant="body">
          {t(emptied ? 'logging:detail.plateEmptied' : 'logging:detail.plateNone')}
        </Text>
      ) : null}

      {/* THE WAY TO PUT SOMETHING ON, under the list it adds to. It raises the
          catalogue search over this page, so a plate is built and resized
          without going anywhere.

          Secondary, and above Save, because the two are different kinds of
          thing: this one opens something and Save is what finishes here. */}
      <Button variant="secondary" fullWidth onPress={onAdd}>
        {t('logging:detail.addPart')}
      </Button>

      {/* AND NO SAVE. The plate writes itself half a second after the last tap
          and once more on the way out, which is what the rest of this screen
          already promised: every control on it is a direct manipulation of one
          part, the totals above move as they are touched, and a button that
          committed all of it afterwards asked the user to confirm a plate they
          had been reading the whole time.

          It also had to be pressed to be discovered. Backing out of this page
          was the ordinary way to leave it, and it threw the work away. */}
    </>
  )
}
