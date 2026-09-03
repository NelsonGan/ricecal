import { useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type EntryIngredient,
  type Food,
  snapshotFromFood,
  useAddIngredient,
  useEntryIngredients,
  useRemoveIngredient,
  useUpdateIngredient,
} from '@/data'
import { AddPartSheet, type PartEdits, PlateEditor, partChanges } from '@/features/logging'
import { useBack } from '@/lib/navigation'
import { AppBar, Screen, useToast } from '@/ui'

/**
 * Edit the plate, as a page of its own.
 *
 * It was a sheet, and the catalogue search that puts a new part on the plate is
 * why it is not: that search is a second panel, so this one had to dismiss
 * itself and be reopened by the host, which works when a food is picked and drops
 * the user past the editor on every other way out.
 *
 * A page does not have that problem: `AddPartSheet` is a sheet on it, and
 * dismissing a sheet reveals the plate with whatever was staged still there.
 *
 * It owns its own data, unlike the sheet, which was handed the ingredients and an
 * overlay of staged edits. The edits live here until Save, and the food detail
 * behind refetches into the result.
 */
export default function IngredientsScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const goBack = useBack('/today')
  const toast = useToast()

  /**
   * Which entry, and which day to invalidate for it.
   *
   * The day travels in the URL rather than being read from `useSelectedDate`,
   * because they are not the same question: the strip's selection is where the
   * user is looking, and this page is about the entry it was opened from, which
   * a deep link could reach on any day at all.
   */
  const { entryId, logDate } = useLocalSearchParams<{ entryId: string; logDate: string }>()

  const { data: ingredients = [], isLoading } = useEntryIngredients(entryId)
  const updateIngredient = useUpdateIngredient()
  const removeIngredient = useRemoveIngredient()
  const addIngredient = useAddIngredient()

  /**
   * The catalogue search, and what it is being opened for.
   *
   * One sheet, two jobs, because they ask the same question: which food. A
   * `null` is "put it on the plate"; an ingredient is "put it on INSTEAD of
   * this one".
   */
  const [picking, setPicking] = useState<{ replacing: EntryIngredient | null } | null>(null)

  const saveFailed = () => toast.show({ title: t('logging:detail.saveFailed'), tone: 'error' })

  /**
   * The plate's parts, one statement each, because `set_ingredient_quantity`
   * takes one ingredient.
   *
   * It leaves the parent row alone on purpose, and the entry's totals follow
   * anyway, because `food_log_details` sums the parts whenever an entry has any.
   *
   * Called on a debounce rather than by a button, and it does NOT navigate: the
   * page is where the user still is. `partChanges` is read against the
   * ingredients as they are now, so a write that has already landed is not sent
   * a second time by the flush on the way out.
   *
   * Throws on to the editor, which says so and keeps the draft.
   *
   * Memoised because the editor holds it in a ref that its debounce reads, and
   * a new identity every render is a new function for a timer that has already
   * been scheduled.
   */
  const savePlate = useCallback(
    async (next: PartEdits) => {
      for (const ingredient of partChanges(ingredients, next)) {
        const staged = next[ingredient.id]
        if (staged === undefined) continue
        await updateIngredient.mutateAsync({
          ingredientId: ingredient.id,
          quantity: staged,
          entryId,
          logDate,
        })
      }
    },
    [ingredients, updateIngredient, entryId, logDate],
  )

  /**
   * A part off the plate, written at once.
   *
   * No confirmation, and no toast either: the row is gone from a list the user
   * is looking at and the total under it has moved, which says more than a line
   * of text would. The swipe that reveals the button is the deliberate half.
   */
  const removePart = (ingredient: EntryIngredient) => {
    removeIngredient
      .mutateAsync({ ingredientId: ingredient.id, entryId, logDate })
      .catch(saveFailed)
  }

  /**
   * A food out of the catalogue, onto the plate.
   *
   * WRITTEN AT ONCE rather than staged, unlike the resizing beside it, and for
   * a reason the staging cannot get around: `PartEdits` is an overlay keyed by
   * ingredient id, and this row has no id until the server issues one.
   *
   * The figures sent are per ONE of the part, at the portion the catalogue
   * quotes: `base` is per base serving and `servingFactor` scales it, so a food
   * whose default portion is not its base has to be multiplied here or the part
   * lands at the wrong size. `snapshotFromFood` is what sanitises the two soft
   * references on the way — the placeholder ids this app mints for routing are
   * not catalogue ids, and `food_id` is a uuid column.
   */
  const addPart = async (picked: Food, replacing: EntryIngredient | null) => {
    setPicking(null)
    const snapshot = snapshotFromFood(picked)
    const scale = snapshot.servingFactor
    // A weight the row cannot hold is sent as no weight at all. `grams` is
    // `numeric(7, 1) check (grams > 0 and grams <= 20000)`, and a catalogue row
    // carrying a zero or something absurd would otherwise turn "add an
    // ingredient" into "could not add that" over a number nobody asked to see.
    const grams = (snapshot.servingGrams ?? 0) * scale
    try {
      await addIngredient.mutateAsync({
        entryId,
        logDate,
        name: snapshot.name,
        kcal: Math.round(snapshot.base.kcal * scale),
        carbs: snapshot.base.carbs * scale,
        protein: snapshot.base.protein * scale,
        fat: snapshot.base.fat * scale,
        grams: grams > 0 && grams <= 20_000 ? grams : undefined,
        foodId: snapshot.foodId,
        servingId: snapshot.servingId,
        servingLabel: snapshot.servingLabel,
        // HOW MANY OF IT, carried over when this is a swap. Replacing two eggs
        // with two pieces of chicken is two, not one: what the user is
        // correcting is which food it was, and the count is the part of the row
        // the scan got right.
        quantity: replacing?.quantity,
      })
      // ADDED FIRST, REMOVED SECOND, and the order is the whole safety of this.
      // `add_ingredient` refuses an entry whose calories were typed over, and a
      // remove that had already run would leave the plate short of a part the
      // user never asked to lose.
      if (replacing) {
        await removeIngredient.mutateAsync({
          ingredientId: replacing.id,
          entryId,
          logDate,
        })
      }
      toast.show({
        title: t(replacing ? 'logging:detail.partReplaced' : 'logging:detail.partAdded', {
          food: snapshot.name,
        }),
        tone: 'success',
        icon: { set: 'ui', name: 'check' },
      })
    } catch (error) {
      // The one refusal worth naming. `add_ingredient` will not break down an
      // entry whose calorie total the user has typed over, because the override
      // sits above the parts and the plate would gain a row without gaining a
      // calorie — which reads as the button not working.
      const typedFigures = error instanceof Error && error.message.includes('typed figures')
      toast.show({
        title: t(typedFigures ? 'logging:detail.addPartTyped' : 'logging:detail.addPartFailed'),
        tone: 'error',
      })
    }
  }

  return (
    <Screen gestureScroll>
      {/* A chevron, not a cross: this is a full page, and the entry it was
          opened from is still on the stack behind it. */}
      <AppBar
        title={t('logging:detail.plateHeading')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      {/* Nothing at all while the parts are being fetched. An editor that draws
          an empty plate and fills it in a moment later reads as a meal that lost
          its ingredients, and the one control on an empty plate — Add — would be
          offering to break down something that is already broken down.

          `entryId` is checked for the same reason the query is keyed on it: a
          route param is whatever was in the URL, and an editor with nothing to
          edit would offer to put a part on an entry the server has never heard
          of. */}
      {entryId && !isLoading ? (
        <PlateEditor
          ingredients={ingredients}
          onSave={savePlate}
          onError={saveFailed}
          onAdd={() => setPicking({ replacing: null })}
          onRemove={removePart}
          onReplace={(ingredient) => setPicking({ replacing: ingredient })}
        />
      ) : null}

      <AddPartSheet
        visible={picking !== null}
        onClose={() => setPicking(null)}
        onPick={(food) => void addPart(food, picking?.replacing ?? null)}
        replacing={picking?.replacing?.name}
      />
    </Screen>
  )
}
