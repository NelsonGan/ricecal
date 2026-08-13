import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import type { IconRef, RecipeIngredientInput, ScannedRecipe } from '@/data'
import {
  removeMealPhoto,
  storedImageSource,
  uploadMealPhoto,
  useMealPhotoUrl,
  useReadRecipe,
  useRecipe,
  useRecipeIngredients,
  useSaveRecipe,
} from '@/data'
import { AiLimitError, NotEntitledError } from '@/data/refusals'
import { IconPicker, InlineCamera } from '@/features/logging'
import {
  DescribeRecipePanel,
  IngredientAmountSheet,
  IngredientSheet,
  ingredientTotal,
  potTotals,
  ReadingRecipe,
  StepsField,
} from '@/features/recipes'
import { MealPhoto } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Button,
  Card,
  ConfirmSheet,
  cn,
  Divider,
  Icon,
  IconButton,
  type IconProps,
  Screen,
  Sheet,
  Skeleton,
  Squish,
  Stepper,
  Tappable,
  Text,
  TextField,
  useToast,
} from '@/ui'

/**
 * A staged ingredient. The key is local and exists only to give React a stable
 * identity across reorders and removals — the rows have no database id until
 * Save writes them, and using the index would make removing the second of three
 * rows animate as if the third had changed.
 */
type StagedIngredient = RecipeIngredientInput & { key: string }

let nextKey = 0
const stage = (input: RecipeIngredientInput): StagedIngredient => ({
  ...input,
  key: `staged-${nextKey++}`,
})

/**
 * What a recipe is drawn as until somebody says otherwise.
 *
 * A recipe is ALWAYS pictured, which is the difference between this and a
 * catalogue food. A food out of the import has no drawing and shows none,
 * because there are a few hundred illustrations against half a million rows and
 * the same stand-in plate beside a thousand different dishes is a lie dressed
 * up as an answer. A recipe is one dish that one person entered, and there is
 * one tap between the pot and the right picture — so the pot is a starting
 * point rather than a stand-in, and it is never what the list ends up full of.
 */
const DEFAULT_RECIPE_ICON: IconRef = { set: 'food', name: 'cooking-pot' }

/**
 * R2 / R3 / R1C — one form for a new recipe and for editing one.
 *
 * The form STAGES everything and the footer writes the lot, exactly as the
 * logged-entry screen does. That is what makes the totals card a preview rather
 * than a report: it reads the staged values through `potTotals`, so what Save
 * commits is what was being read. Writing as you type would be four round trips
 * for a pot corrected in four places, and would make changing your mind a
 * matter of changing the control back.
 *
 * The photograph is the exception and is uploaded the moment it is taken. It
 * has to be: the reader on the server fetches the object out of the bucket, so
 * there is nothing to read until the object exists — the same order the meal
 * scan uses, and for the same reason.
 */
export default function RecipeFormScreen() {
  const { t } = useTranslation(['recipes', 'common', 'paywall'])
  const router = useRouter()
  const goBack = useBack('/recipes')
  const toast = useToast()
  const colors = useThemeColors()

  const params = useLocalSearchParams<{ id?: string }>()
  const recipeId = params.id
  const { data: existing } = useRecipe(recipeId)
  const { data: existingIngredients } = useRecipeIngredients(recipeId)

  const save = useSaveRecipe()
  const read = useReadRecipe()

  const [name, setName] = useState('')
  const [servings, setServings] = useState(1)
  const [steps, setSteps] = useState('')
  // A recipe is never pictureless. See `DEFAULT_RECIPE_ICON`.
  const [icon, setIcon] = useState<IconRef | null>(DEFAULT_RECIPE_ICON)
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  /** The picture before it has a key — what the tile shows while it uploads. */
  const [localPhoto, setLocalPhoto] = useState<string | null>(null)
  const [items, setItems] = useState<StagedIngredient[]>([])

  /**
   * The cook has answered the picture question themselves.
   *
   * A ref rather than state because nothing renders differently for it: its
   * only job is to stop `applyDraft` from replacing a drawing that was CHOSEN
   * with one the model picked. The form's default counts as unanswered, which
   * is the whole reason a plain boolean is not enough — `icon` is never null on
   * a new recipe, so "is it empty" cannot be the test the way it is for the
   * name and the steps.
   */
  const pictureChosen = useRef(false)
  /** The upload behind the picture tile, which is a second or two on a real photo. */
  const [attaching, setAttaching] = useState(false)
  /** A drawing waiting on the confirmation, because choosing it discards a photo. */
  const [pendingIcon, setPendingIcon] = useState<IconRef | undefined>(undefined)
  const [picking, setPicking] = useState(false)

  const [dirty, setDirty] = useState(false)
  const [adding, setAdding] = useState(false)
  /**
   * Which staged row the amount sheet is open on, by its local key rather than
   * by index — the list is filtered on removal, so an index would point at a
   * different ingredient the moment one above it went.
   */
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [camera, setCamera] = useState(false)
  const [describing, setDescribing] = useState(false)
  /**
   * Which read is in flight, and the form is not editable while it is.
   *
   * It names the SOURCE rather than being a boolean because nothing else on
   * screen still knows: the describe sheet is dismissed before the call is
   * made, and `filled` is not set until the answer lands, so a wait that
   * reasoned from those two said "Reading your photo…" over somebody's typing.
   *
   * Preferred to `read.isPending` for the same reason — the mutation knows it
   * is running and not what it was given.
   */
  const [reading, setReading] = useState<'photo' | 'text' | null>(null)
  // The describe sheet has actually been presented. `autoFocus` inside a
  // `Modal` is applied while the field is still off screen and routinely
  // dropped, so the field waits for `onShow` rather than for `visible`.
  const [describeReady, setDescribeReady] = useState(false)
  const [leaving, setLeaving] = useState(false)
  /**
   * The form has been filled in for them already.
   *
   * All this does now is retire the two offers at the top: having read the pot
   * once, a second "Photo" tile above a full form is a button that overwrites
   * nothing (`applyDraft` only writes over empty fields) and looks like one
   * that would. There used to be a banner underneath saying which way it was
   * filled in, and it was a badge congratulating the app on having worked —
   * the fields it filled in are right there and say it better.
   */
  const [filled, setFilled] = useState(false)

  /**
   * Seed the form from the recipe being edited, exactly once.
   *
   * A ref rather than a `useEffect` dependency list, because the queries settle
   * at different moments and the form is editable in between: re-seeding when
   * the ingredients arrive would wipe a name already typed. The ref holds the id
   * that has been seeded, so navigating from one recipe to another still works.
   */
  const seeded = useRef<string | null>(null)
  useEffect(() => {
    if (!recipeId || !existing || !existingIngredients) return
    if (seeded.current === recipeId) return
    seeded.current = recipeId

    setName(existing.name)
    setServings(existing.servings)
    setSteps(existing.steps ?? '')
    // A recipe saved before there was a default has neither, and it gets the
    // default now rather than an empty box: the picture is answerable in one
    // tap and there is no reading of "no picture" that is a choice.
    setIcon(existing.icon ?? (existing.photoPath ? null : DEFAULT_RECIPE_ICON))
    setPhotoPath(existing.photoPath ?? null)
    // Whatever is on the row IS their answer, default or not, so a read on this
    // form may not overwrite it.
    pictureChosen.current = true
    setItems(existingIngredients.map((item) => stage(item)))
  }, [recipeId, existing, existingIngredients])

  const totals = potTotals(items, servings)
  const ready = name.trim().length > 0
  const editing = items.find((item) => item.key === editingKey)

  const touch = () => setDirty(true)

  /**
   * The two refusals, shown and swallowed. Anything else is re-thrown for the
   * caller's own "we could not read it" message, which is the ordinary
   * failure and the one the user can do something about by typing.
   */
  const showRefusal = (error: unknown): boolean => {
    if (error instanceof AiLimitError) {
      toast.show({ title: t('paywall:limit.reached'), tone: 'error' })
      return true
    }
    if (error instanceof NotEntitledError) {
      router.push({ pathname: '/paywall/gate', params: { feature: 'describe' } })
      return true
    }
    return false
  }

  /**
   * A photo of the pot: attach it, then read it.
   *
   * The upload has to finish before the read starts, and both have to finish
   * before the form is filled — so this is one sequence rather than two
   * handlers. A failure at either step leaves the form exactly as it was, with
   * the photograph attached if it got that far, because a picture the user took
   * is worth keeping even when nothing could be read off it.
   */
  const readPhoto = async (uri: string | undefined) => {
    setCamera(false)
    if (!uri) return

    const key = await attachPhoto(uri)
    if (!key) {
      toast.show({ title: t('recipes:new.scanFailed'), tone: 'warning' })
      return
    }

    setReading('photo')
    let draft: ScannedRecipe | null
    try {
      draft = await read.mutateAsync({ photoPath: key })
    } catch (error) {
      if (showRefusal(error)) return
      draft = null
    } finally {
      setReading(null)
    }
    if (!draft) {
      toast.show({ title: t('recipes:new.scanFailed'), tone: 'warning' })
      return
    }

    applyDraft(draft)
  }

  /**
   * A picture into the form: upload it, put it on the row, drop the drawing.
   *
   * Shared by the two ways one arrives — the "Photo" tile that also READS the
   * pot, and the picker that only changes the picture — so the pair cannot
   * drift on the orphan sweep below, which is the part with a cost attached.
   * Answers the key, or null when the upload failed; the caller says so,
   * because the two have different things to apologise for.
   */
  const attachPhoto = async (uri: string): Promise<string | null> => {
    setPicking(false)
    setLocalPhoto(uri)
    pictureChosen.current = true
    touch()

    setAttaching(true)
    let key: string
    try {
      key = await uploadMealPhoto(uri)
    } catch {
      setLocalPhoto(null)
      return null
    } finally {
      setAttaching(false)
    }

    // A photo retaken before Save orphans the one it replaces, and Save only
    // knows about the key the form OPENED with — so the sweep for a mid-session
    // replacement has to happen here. Never the key the recipe was saved with:
    // that one is still on the row until the write lands, and `useSaveRecipe`
    // is what deletes it.
    setPhotoPath((current) => {
      if (current && current !== existing?.photoPath) removeMealPhoto(current).catch(() => {})
      return key
    })
    // A photo and a drawing answer the same question, and the photo wins.
    setIcon(null)
    return key
  }

  /**
   * A drawing onto the form, which is the one choice here that discards
   * something: the photograph of the actual pot, if there is one. The caller
   * puts the confirmation in front of it.
   */
  const applyIcon = (next: IconRef) => {
    setPicking(false)
    pictureChosen.current = true
    setIcon(next)
    // Uploaded this session and now unwanted. The key the recipe was SAVED
    // with is left alone for `useSaveRecipe` to sweep, for the reason above.
    setPhotoPath((current) => {
      if (current && current !== existing?.photoPath) removeMealPhoto(current).catch(() => {})
      return null
    })
    setLocalPhoto(null)
    touch()
  }

  /**
   * The pot in words: read it, then fill the form.
   *
   * Shorter than the photo path by exactly the upload, which is the only thing
   * that path does that this one does not. Everything after the model call is
   * the same, hence `applyDraft`.
   */
  const readText = async (described: string) => {
    setDescribing(false)
    setDescribeReady(false)
    touch()

    setReading('text')
    let draft: ScannedRecipe | null
    try {
      draft = await read.mutateAsync({ text: described })
    } catch (error) {
      if (showRefusal(error)) return
      draft = null
    } finally {
      setReading(null)
    }
    if (!draft) {
      toast.show({ title: t('recipes:new.describeFailed'), tone: 'warning' })
      return
    }
    applyDraft(draft)
  }

  /**
   * A draft into the form, ONLY OVER EMPTY FIELDS.
   *
   * Somebody who typed a name and then reached for the camera meant it to fill
   * in the parts they had not done, not to overwrite the part they had. Shared
   * by both paths so the two cannot drift on which fields they are willing to
   * clobber.
   */
  const applyDraft = (draft: ScannedRecipe) => {
    setFilled(true)
    setName((current) => current || draft.name)
    setSteps((current) => current || draft.steps)
    setServings((current) => (current === 1 ? draft.servings : current))
    setItems((current) => (current.length > 0 ? current : draft.ingredients.map(stage)))
    // The same rule, applied to the one field that is never empty. The model
    // picks the drawing out of our own set (see the server's `icons.ts`), and
    // it beats the generic pot the form opens with — but not a drawing the
    // cook picked, and not the photograph they just took, which is why the
    // photo path never asks for one.
    if (draft.icon && !pictureChosen.current) setIcon(draft.icon)
  }

  const commit = async () => {
    if (!ready) {
      toast.show({ title: t('recipes:edit.nameRequired'), tone: 'warning' })
      return
    }

    let result: Awaited<ReturnType<typeof save.mutateAsync>>
    try {
      result = await save.mutateAsync({
        id: recipeId,
        name,
        servings,
        steps,
        icon,
        photoPath,
        previousPhotoPath: existing?.photoPath,
        ingredients: items.map(({ key: _key, ...input }) => input),
      })
    } catch {
      // Stay on the form. Everything the user typed is still staged, so Save is
      // the retry — navigating away on a failed write would lose the lot and
      // leave them looking at the old recipe wondering what happened.
      toast.show({ title: t('recipes:edit.saveFailed'), tone: 'error' })
      return
    }

    // A published recipe that was edited went back through the reviewer. Say
    // which way it went, because the recipe is out of the community tab until
    // it passes and nothing else on screen would show that.
    if (result.review?.status === 'rejected') {
      toast.show({
        title: result.review.reason
          ? t('recipes:review.rejected', { reason: result.review.reason })
          : t('recipes:review.rejectedPlain'),
        tone: 'warning',
      })
    } else if (result.review?.status === 'pending') {
      toast.show({ title: t('recipes:review.pending'), tone: 'neutral' })
    } else {
      toast.show({ title: t('recipes:edit.saved'), tone: 'success' })
    }

    // `replace`, so the back gesture from the recipe lands on the list rather
    // than on the form that no longer has anything to save.
    router.replace({ pathname: '/recipe/[id]', params: { id: result.id } })
  }

  const leave = () => (dirty ? setLeaving(true) : goBack())

  return (
    <Screen
      footer={
        <Button
          fullWidth
          loading={save.isPending}
          // Nothing to save yet, and nothing that would survive the draft
          // landing on top of it. See `ReadingRecipe`.
          disabled={!ready || reading !== null}
          onPress={commit}
        >
          {t('recipes:edit.save')}
        </Button>
      }
    >
      <AppBar
        title={recipeId ? t('recipes:edit.title') : t('recipes:new.title')}
        onBack={leave}
        // A cross rather than a chevron: the back control here discards, and a
        // chevron promises a hierarchy this form does not have.
        leading="dismiss"
        backLabel={t('common:a11y.close')}
      />

      {/* The form, or the wait for it.

          The wait REPLACES the form rather than sitting over it, and that is
          the point: `applyDraft` only writes over empty fields, so a name
          typed into a live form while the model was thinking is a name the
          draft then declines to correct, and the servings and the ingredients
          arrive around it. For these few seconds there is no answer to edit. */}
      {reading ? (
        <ReadingRecipe source={reading} />
      ) : (
        <>
          {/* Two ways to have the form filled in, on a NEW recipe only. Editing
          one, the form is already full and a button that overwrites it is a
          trap.

          Both offered at once rather than behind a chooser: they answer
          different situations, not different preferences. The pot is on the
          stove, or it is not. */}
          {!recipeId && !filled ? (
            <View className="gap-2.5">
              <View className="flex-row gap-2.5">
                <FillOption
                  icon={{ set: 'system', name: 'camera' }}
                  label={t('recipes:new.scanLabel')}
                  tone="pandan"
                  onPress={() => setCamera(true)}
                />
                <FillOption
                  icon={{ set: 'system', name: 'sparkle' }}
                  label={t('recipes:new.describeLabel')}
                  tone="kaya"
                  onPress={() => setDescribing(true)}
                />
              </View>
              <View className="flex-row items-center gap-3 pt-1">
                <View className="h-0.5 flex-1 bg-line" />
                <Text variant="overline">{t('recipes:new.or')}</Text>
                <View className="h-0.5 flex-1 bg-line" />
              </View>
            </View>
          ) : null}

          <TextField
            label={t('recipes:edit.name')}
            value={name}
            onChangeText={(next) => {
              setName(next)
              touch()
            }}
            placeholder={t('recipes:edit.namePlaceholder')}
          />

          <View className="gap-1.5">
            <Text variant="label">{t('recipes:edit.picture')}</Text>
            <RecipePicture
              icon={icon}
              photoPath={photoPath}
              localPhoto={localPhoto}
              attaching={attaching}
              onPress={() => setPicking(true)}
            />
          </View>

          <View className="gap-1.5">
            <Text variant="label">{t('recipes:edit.servings')}</Text>
            <Card contentClassName="px-3 py-2">
              <Stepper
                value={servings}
                onChange={(next) => {
                  setServings(next)
                  touch()
                }}
                step={1}
                min={1}
                max={100}
                format={(value) => String(Math.round(value))}
                decrementLabel={t('common:a11y.decrease')}
                incrementLabel={t('common:a11y.increase')}
              />
            </Card>
          </View>

          <View className="gap-1.5">
            <Text variant="label">
              {items.length
                ? t('recipes:edit.ingredientsCount', { count: items.length })
                : t('recipes:edit.ingredients')}
            </Text>

            <Card>
              {items.length === 0 ? (
                <Text variant="meta">{t('recipes:edit.ingredientsEmpty')}</Text>
              ) : null}

              {items.map((item, index) => {
                const line = ingredientTotal(item.perUnit, item.amount)
                const measure = `${item.amount} ${t(`recipes:ingredient.unit.${item.unit}`, {
                  count: item.amount,
                })}`
                return (
                  <View key={item.key}>
                    {index > 0 ? <Divider /> : null}
                    <View className="flex-row items-center gap-2.5">
                      {/* The row opens the amount and the cross stays outside
                          it. An autofilled pot arrives with amounts the model
                          estimated, and until this was tappable the only way to
                          correct one was to delete the row and add it again —
                          which for an ingredient the model invented meant
                          retyping its calories by hand, since a described
                          recipe never goes near the catalogue. */}
                      <Tappable
                        className="min-w-0 flex-1 flex-row items-center gap-2.5 py-2.5"
                        onPress={() => setEditingKey(item.key)}
                        accessibilityRole="button"
                        accessibilityLabel={t('recipes:ingredient.change', {
                          name: item.name,
                          measure,
                        })}
                      >
                        <View className="min-w-0 flex-1">
                          <Text variant="bodyStrong" numberOfLines={1}>
                            {item.name}
                          </Text>
                          <View className="flex-row items-center gap-1">
                            <Text variant="meta">{measure}</Text>
                            {/* Small, muted, and on every row: one row wearing
                                a pencil would read as the only one that can be
                                changed. */}
                            <Icon set="ui" name="edit" size={12} tintColor={colors.muted} />
                          </View>
                        </View>
                        <View className="flex-row items-baseline gap-1">
                          <Text variant="numeric" className="text-[17px] leading-[22px]">
                            {line.kcal.toLocaleString()}
                          </Text>
                          <Text variant="caption">{t('common:unit.kcal')}</Text>
                        </View>
                      </Tappable>
                      <IconButton
                        size="sm"
                        accessibilityLabel={`${t('recipes:ingredient.remove')}, ${item.name}`}
                        onPress={() => {
                          setItems((current) => current.filter((row) => row.key !== item.key))
                          touch()
                        }}
                      >
                        <Icon set="ui" name="close" size={16} tintColor={colors.muted} />
                      </IconButton>
                    </View>
                  </View>
                )
              })}

              <Divider />
              <Tappable
                className="flex-row items-center gap-2.5 pt-3"
                onPress={() => setAdding(true)}
                accessibilityRole="button"
                accessibilityLabel={t('recipes:edit.addIngredient')}
              >
                <View className="h-[30px] w-[30px] items-center justify-center rounded-md bg-pandan-soft">
                  <Icon set="ui" name="plus" size={16} />
                </View>
                <Text variant="label" className="text-pandan-ink">
                  {t('recipes:edit.addIngredient')}
                </Text>
              </Tappable>
            </Card>
          </View>

          {/* The preview. Reads the staged values, so it cannot disagree with what
          Save is about to write. */}
          {items.length > 0 ? (
            <Card>
              <View className="flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text variant="bodyStrong">
                    {t('recipes:edit.totalLabel', { count: servings })}
                  </Text>
                  <Text variant="meta">
                    {t('recipes:edit.totalWhole', { kcal: totals.total.kcal.toLocaleString() })}
                  </Text>
                </View>
                <View className="flex-row items-baseline gap-1">
                  <Text variant="numeric" className="text-[26px] leading-[32px] text-pandan-ink">
                    {totals.perServing.kcal.toLocaleString()}
                  </Text>
                  <Text variant="caption">{t('common:unit.kcal')}</Text>
                </View>
              </View>
            </Card>
          ) : null}

          <StepsField
            value={steps}
            onChange={(next) => {
              setSteps(next)
              touch()
            }}
          />

          <IconPicker
            visible={picking}
            onClose={() => setPicking(false)}
            selected={icon ?? undefined}
            // Held back for the confirmation below when there is a photo to lose.
            onSelect={(next) => (photoPath || localPhoto ? setPendingIcon(next) : applyIcon(next))}
            // The other way to answer the same question, in the same sheet. It
            // only changes the PICTURE: reading the pot out of a photograph is
            // what the "Photo" tile at the top of a new recipe does, and doing it
            // here too would refill a form the cook has already been through.
            onPickPhoto={(uri) => {
              void attachPhoto(uri).then((key) => {
                if (!key) toast.show({ title: t('recipes:new.scanFailed'), tone: 'warning' })
              })
            }}
          />

          {/* Fires when a drawing is chosen over a photo, which is the one choice
          in this form that throws something away. A photo replacing a photo
          does not come through here. */}
          <ConfirmSheet
            visible={pendingIcon !== undefined}
            onClose={() => setPendingIcon(undefined)}
            onConfirm={() => {
              if (pendingIcon) applyIcon(pendingIcon)
              setPendingIcon(undefined)
            }}
            title={t('recipes:edit.replacePhotoTitle')}
            description={t('recipes:edit.replacePhotoBody')}
            confirmLabel={t('recipes:edit.replacePhotoConfirm')}
            cancelLabel={t('common:action.cancel')}
            tone="danger"
          />

          <IngredientSheet
            visible={adding}
            onClose={() => setAdding(false)}
            onAdd={(input) => {
              setItems((current) => [...current, stage(input)])
              touch()
            }}
          />

          <IngredientAmountSheet
            ingredient={editing ?? null}
            onClose={() => setEditingKey(null)}
            onSave={(next) => {
              setItems((current) =>
                current.map((row) => (row.key === editingKey ? { ...row, ...next } : row)),
              )
              touch()
            }}
          />

          {/* Not full height and not scrollable: a viewfinder, a shutter and two
          buttons fit inside the 440pt cap with room to spare, and there is no
          text field here to raise a keyboard — which is the only thing
          `fullHeight` exists to survive. No footer either: the shutter IS the
          action. */}
          <Sheet
            visible={camera}
            onClose={() => setCamera(false)}
            title={t('recipes:new.scanTitle')}
            closeLabel={t('common:action.close')}
            scrollable={false}
          >
            <InlineCamera onCapture={readPhoto} />
          </Sheet>

          {/* A text field, so full height and not scrollable — the two rules a sheet
          with typing in it always follows. See the note in CLAUDE.md. */}
          <Sheet
            visible={describing}
            onClose={() => setDescribing(false)}
            title={t('recipes:new.describeTitle')}
            closeLabel={t('common:action.close')}
            fullHeight
            scrollable={false}
            onShow={() => setDescribeReady(true)}
          >
            {/* `autoFocus` inside a `Modal` is dropped, so the field is mounted only
            once the window is actually presented and focuses itself then. */}
            {describeReady ? <DescribeRecipePanel autoFocus onSubmit={readText} /> : null}
          </Sheet>
        </>
      )}

      <ConfirmSheet
        visible={leaving}
        onClose={() => setLeaving(false)}
        title={t('recipes:edit.discardTitle')}
        description={t('recipes:edit.discardBody')}
        confirmLabel={t('recipes:edit.discardConfirm')}
        cancelLabel={t('common:action.cancel')}
        tone="danger"
        onConfirm={() => {
          setLeaving(false)
          goBack()
        }}
      />
    </Screen>
  )
}

/**
 * One of the two offers to fill the form in.
 *
 * A SQUARE-ISH TILE, side by side with its sibling, rather than a full-width
 * row. Two stacked rows read as a list of settings and pushed the form's first
 * real field below the fold; two tiles read as a choice, which is what this is.
 * The same shape as the quick actions on the log sheet, and for the same
 * reason.
 *
 * The label is one word and the explanation is GONE, not truncated. At this
 * width a sentence wraps to three lines and makes the tile taller than the
 * field it is offering to fill; "Photo" and "Describe" under an icon say what
 * happens, and the sheet that opens says the rest — the describe panel's own
 * placeholder is a worked example, which is a better explanation than a caption
 * would have been.
 *
 * A component rather than two near-copies, because near-copies drift: the two
 * differ by an icon, a word and a tint, and everything else about them is one
 * control.
 */
function FillOption({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: IconProps
  label: string
  tone: 'pandan' | 'kaya'
  onPress: () => void
}) {
  return (
    <Squish
      depth={6}
      radius={22}
      containerClassName="flex-1"
      slabClassName={tone === 'pandan' ? 'bg-pandan-soft-line' : 'bg-kaya-soft-line'}
      className={cn(
        'items-center gap-2 border-[3px] px-3 py-4',
        tone === 'pandan' ? 'border-pandan bg-pandan-soft' : 'border-kaya-soft-line bg-kaya-soft',
      )}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon {...icon} size={30} />
      <Text variant="label" numberOfLines={1}>
        {label}
      </Text>
    </Squish>
  )
}

/**
 * The picture, in whichever of its states it is in: a local file still
 * uploading, a key in the bucket, or a drawing.
 *
 * FULL WIDTH, and the same two heights the logged-entry screen uses. It was a
 * 104x76 thumbnail beside the servings stepper, which is a box sized for an
 * icon — a photograph of a pot went into it as a letterbox strip through the
 * middle of the dish, and a cook who had just taken a picture of their dinner
 * saw a sliver of it. A photo gets 260pt and a drawing keeps the short box,
 * because a 100pt illustration in a 260pt frame is a small picture in a large
 * empty one.
 *
 * There is no empty state and no "add a picture" prompt: a recipe always has
 * one, because the form opens with `DEFAULT_RECIPE_ICON` in it.
 */
function RecipePicture({
  icon,
  photoPath,
  localPhoto,
  attaching,
  onPress,
}: {
  icon: IconRef | null
  photoPath: string | null
  localPhoto: string | null
  attaching: boolean
  onPress: () => void
}) {
  const { t } = useTranslation('recipes')
  const { data: photoUrl, isLoading: resolvingPhoto } = useMealPhotoUrl(photoPath ?? undefined)
  const photo = storedImageSource(photoPath ?? undefined, photoUrl, localPhoto ?? undefined)
  /**
   * The box is tall when a PHOTOGRAPH is in it, and the test has to agree with
   * what the body below actually draws — the photo wins there, so it wins here.
   *
   * Asking `&& !icon` as well looked right (it is what the logged-entry screen
   * asks, where a drawing overrides the photo) and was wrong here: this form
   * clears one when the other is chosen, but a recipe saved before it existed
   * can carry both, and that row drew its photograph inside the short box —
   * which is the letterboxing this height exists to stop.
   *
   * `resolvingPhoto` counts as having one: it means the recipe HAS a photograph and
   * we are waiting on a URL for it. Left out, the box opens short and grows by
   * 130pt under the reader a moment later.
   */
  const tall = Boolean(photo || resolvingPhoto || attaching)

  return (
    <Tappable
      className={cn(
        'items-center justify-center overflow-hidden rounded-card border-[3px] border-line bg-track',
        tall ? 'h-[260px]' : 'h-[130px]',
      )}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('edit.changePicture')}
    >
      {attaching ? (
        // The upload resizes and encodes a 3-6MB frame before it sends it, so
        // this is a second or two on a real photo — long enough that a tile
        // which did not change would read as the camera having done nothing.
        <ActivityIndicator />
      ) : photo ? (
        <MealPhoto source={photo} />
      ) : resolvingPhoto ? (
        /* This recipe HAS a photograph and it is still being signed for.
           Without this the box drew the drawing first and then replaced it
           with the photograph — the largest thing on the screen changing into
           something else while being looked at. */
        <Skeleton width="100%" height={260} rounded={false} className="bg-line" />
      ) : icon ? (
        <Icon {...icon} size={100} />
      ) : (
        <Icon set="food" name="cooking-pot" size={100} />
      )}
    </Tappable>
  )
}
