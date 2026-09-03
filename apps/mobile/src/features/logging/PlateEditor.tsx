import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput, View } from 'react-native'

import type { EntryIngredient } from '@/data'
import { SwipeRow } from '@/features/shared'
import { titleCase } from '@/lib/portions'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Card, cn, Divider, Icon, IconButton, Text, useNumpadField } from '@/ui'
import { PartLine } from './PartLine'
import {
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
  onSave,
  onError,
  onAdd,
  onRemove,
  onReplace,
}: PlateEditorProps) {
  const { t } = useTranslation(['logging', 'common'])
  const colors = useThemeColors()

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
  /**
   * Where a tap on the plus or the minus would land this part, IN GRAMS wherever
   * grams are known, and `null` where there is nowhere left to go.
   *
   * Read twice: once to move the part, and once to decide whether the button
   * that moves it should be live at all. Working it out in two places is what
   * left a minus looking pressable that did nothing — the button asked whether
   * the QUANTITY was at its quarter while the arithmetic under it was stopping a
   * ten gram step short of the same floor, and between those two answers there
   * is a part at "~¼ × / 14 g" with an enabled button and no effect.
   */
  const stepTarget = (ingredient: EntryIngredient, direction: 1 | -1): number | null => {
    const perUnit = perUnitGrams(ingredient)
    const next =
      perUnit === null || ingredient.grams === null
        ? stepPart(ingredient.quantity, direction)
        : (() => {
            const grams = stepGrams(ingredient.grams, perUnit, direction)
            return grams === null ? null : quantityForGrams(grams, perUnit)
          })()
    // A step that lands back where it started is not a step. The grams path
    // CLAMPS at both ends rather than refusing, so this is what tells the
    // ceiling from a move.
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
   * A weight typed in by hand, which is the precise way to answer "it was more
   * like 200 g". The buttons are the nudge.
   */
  const setGrams = (ingredient: EntryIngredient, grams: number) => {
    const perUnit = perUnitGrams(ingredient)
    if (perUnit === null) return
    stage(ingredient.id, quantityForGrams(grams, perUnit))
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
        const perUnit = perUnitGrams(ingredient)
        const weighed = perUnit !== null && ingredient.grams !== null
        // The minus STOPS at the smallest amount rather than removing the row,
        // which it used to do. Under a Save button that was the only way to say
        // "there wasn't any"; with the plate writing itself it is a part deleted
        // by a tap that looks like the twenty before it. Swiping the row is where
        // removal went. The floor is a quarter of one unit either way, said in
        // whichever unit the row is in.
        const atFloor = stepTarget(ingredient, -1) === null
        const atCeiling = stepTarget(ingredient, 1) === null

        return (
          <View key={ingredient.id}>
            {/* Inset to the text rather than run wall to wall, which is what
                every other list card in the app does, and outside the `SwipeRow`
                so it stays put while the row slides over its buttons. */}
            {index > 0 ? <Divider className="mx-card" /> : null}

            {/* THE TWO THINGS A SWIPE UNCOVERS, and between them they are why
                the minus above no longer empties a row. Delete is where "there
                wasn't any" went; Replace is the answer to a scan that named the
                right kind of thing and the wrong one of it, which used to cost a
                delete, a search and an add.

                Replace nearest the row and Delete outermost: the destructive one
                belongs at the end of the drag, which is where a long swipe puts
                the thumb and where iOS has taught people to expect it. */}
            <SwipeRow
              square
              actions={[
                {
                  label: t('logging:detail.replacePart'),
                  a11yLabel: t('logging:detail.replaceOf', { name: ingredient.name }),
                  icon: 'swap',
                  tone: 'water',
                  onPress: () => onReplace(ingredient),
                },
                {
                  label: t('common:action.delete'),
                  a11yLabel: t('logging:detail.removeOf', { name: ingredient.name }),
                  icon: 'delete',
                  tone: 'hibiscus',
                  exits: true,
                  onPress: () => {
                    setEmptied(true)
                    onRemove(ingredient)
                  },
                },
              ]}
            >
              {/* Opaque, because the buttons are underneath: the row slides over
                  them and anything see-through would show a bin through the
                  ingredient's own name. */}
              <View className="gap-2 bg-surface px-card py-md">
                {/* The name on a line of its own, with the whole width to wrap into.
                Beside the controls it had about half the row, which is what this
                sheet exists to give back.

                THE COUNT LEADS IT, the same cart line the ingredient card shows,
                and this is where it has room: under the weight field it would be
                a name wrapping inside a 70pt column between two buttons. It moves
                as the weight does — the buttons and the field below set grams,
                and this is those grams read back as a number of the thing. */}
                <PartLine
                  quantity={ingredient.quantity}
                  name={ingredient.name}
                  variant="bodyStrong"
                />

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
                      accessibilityLabel={t('logging:detail.lessOf', { name: ingredient.name })}
                      disabled={atFloor}
                      onPress={() => step(ingredient, -1)}
                    >
                      <Icon set="ui" name="minus" size={16} tintColor={colors.ink} />
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
            </SwipeRow>
          </View>
        )
      })}

      {/* THE SUM, and the last child of the card on purpose. `Squish` clips at
          the container and its surface layer does not, so a filled row here
          would paint square white corners over the slab; this one is
          transparent and takes the card's own corners. */}
      <Divider className="mx-card" />
      <View className="flex-row items-baseline justify-between gap-3 px-card py-md">
        <Text variant="bodyStrong">{t('logging:detail.plateTotal')}</Text>
        <View className="flex-row items-baseline gap-1">
          <Text variant="numeric">
            {parts.reduce((sum, item) => sum + item.kcal, 0).toLocaleString()}
          </Text>
          <Text variant="caption">{t('common:unit.kcal')}</Text>
        </View>
      </View>
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
