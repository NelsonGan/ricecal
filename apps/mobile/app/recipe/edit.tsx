import { FREE_RECIPES } from '@ricecal/shared'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, type TextInputInstance, View } from 'react-native'

import type { IconRef, RecipeIngredientInput, RecipeTag, ScannedRecipe } from '@/data'
import {
  isRecipeLimit,
  RECIPE_TAGS,
  removeMealPhoto,
  storedImageSource,
  uploadMealPhoto,
  useMealPhotoUrl,
  useReadRecipe,
  useRecipe,
  useRecipeIngredients,
  useSaveRecipe,
  useSettings,
} from '@/data'
import { announceRefusal, openPaywall } from '@/data/refusals'
import { IconPicker } from '@/features/logging'
import {
  clearRecipeRead,
  IngredientSheet,
  normaliseSourceUrl,
  type PendingRecipeRead,
  parseMinutes,
  peekRecipeRead,
  potTotals,
  ReadingRecipe,
  RecipeIngredientEditor,
  StepsField,
} from '@/features/recipes'
import { MealPhoto } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Button,
  Chip,
  ConfirmSheet,
  cn,
  FormCard,
  FormRow,
  Icon,
  Screen,
  Skeleton,
  Stepper,
  Tappable,
  Text,
  TextField,
  useToast,
} from '@/ui'

/**
 * A staged ingredient. The key is local and gives React a stable identity across
 * reorders: the rows have no database id until Save writes them, and using the
 * index would make removing the second of three animate as if the third changed.
 */
type StagedIngredient = RecipeIngredientInput & { key: string }

let nextKey = 0
const stage = (input: RecipeIngredientInput): StagedIngredient => ({
  ...input,
  key: `staged-${nextKey++}`,
})

/**
 * What a recipe is drawn as until somebody says otherwise. A recipe is always
 * pictured, unlike a catalogue food, which shows nothing rather than putting the
 * same stand-in plate beside a thousand dishes. A recipe is one dish one person
 * entered, with one tap between the pot and the right picture.
 */
const DEFAULT_RECIPE_ICON: IconRef = { set: 'food', name: 'cooking-pot' }

/**
 * One form for a new recipe and for editing one.
 *
 * The form stages everything and the footer writes the lot, which is what makes
 * the totals card a preview rather than a report: it reads the staged values
 * through `potTotals`. Writing as you type would be four round trips for a pot
 * corrected in four places.
 *
 * The photograph is the exception and is uploaded the moment it is taken,
 * because the reader on the server fetches the object out of the bucket.
 */
export default function RecipeFormScreen() {
  const { t } = useTranslation(['recipes', 'common', 'paywall'])
  const router = useRouter()
  const navigation = useNavigation()
  const goBack = useBack('/recipes')
  const toast = useToast()

  const params = useLocalSearchParams<{ id?: string; read?: string }>()
  const recipeId = params.id
  const { data: existing } = useRecipe(recipeId)
  const { data: existingIngredients } = useRecipeIngredients(recipeId)
  const { data: settings } = useSettings()

  const save = useSaveRecipe()
  const read = useReadRecipe()

  // Picked up from the Recipes tab's Photo or Describe sheet before this route
  // opened. Reading starts on the first frame so the blank form never flashes
  // behind the loading state.
  const [initialRead] = useState<PendingRecipeRead | null>(() =>
    !recipeId && params.read === '1' ? peekRecipeRead() : null,
  )

  const [name, setName] = useState('')
  const [servings, setServings] = useState(1)
  const [steps, setSteps] = useState('')
  // A recipe is never pictureless. See `DEFAULT_RECIPE_ICON`.
  const [icon, setIcon] = useState<IconRef | null>(DEFAULT_RECIPE_ICON)
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  /** The picture before it has a key — what the tile shows while it uploads. */
  const [localPhoto, setLocalPhoto] = useState<string | null>(null)
  const [items, setItems] = useState<StagedIngredient[]>([])
  /** As typed, so an empty field stays empty rather than turning into a 0. */
  const [prep, setPrep] = useState('')
  const [cook, setCook] = useState('')
  const [tags, setTags] = useState<RecipeTag[]>([])
  const [source, setSource] = useState('')
  const [sourceError, setSourceError] = useState<string | undefined>(undefined)

  /**
   * The cook has answered the picture question themselves. A ref, because nothing
   * renders differently for it: its job is to stop `applyDraft` replacing a chosen
   * drawing with one the model picked. The form's default counts as unanswered,
   * so "is it empty" cannot be the test the way it is for the name.
   */
  const pictureChosen = useRef(false)
  const nameField = useRef<TextInputInstance>(null)
  /** The upload behind the picture tile, which is a second or two on a real photo. */
  const [attaching, setAttaching] = useState(false)
  /** A drawing waiting on the confirmation, because choosing it discards a photo. */
  const [pendingIcon, setPendingIcon] = useState<IconRef | undefined>(undefined)
  const [picking, setPicking] = useState(false)

  const [dirty, setDirty] = useState(false)
  /** Null is closed; a missing key adds, and a key replaces that staged row. */
  const [pickingIngredient, setPickingIngredient] = useState<{ replacingKey?: string } | null>(null)
  /**
   * Which read is in flight, and the form is not editable while it is. It names
   * the source so the loading screen knows whether it is reading a photograph
   * or typed text.
   */
  const [reading, setReading] = useState<'photo' | 'text' | null>(() => initialRead?.kind ?? null)
  const [leaving, setLeaving] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /**
   * Seed the form from the recipe being edited, exactly once. A ref rather than a
   * dependency list, because the queries settle at different moments and the form
   * is editable in between, so re-seeding when the ingredients arrive would wipe
   * a name already typed. The ref holds the id, so navigating between recipes
   * still works.
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
    setPrep(existing.prepMinutes != null ? String(existing.prepMinutes) : '')
    setCook(existing.cookMinutes != null ? String(existing.cookMinutes) : '')
    setTags(existing.tags)
    setSource(existing.sourceUrl ?? '')
  }, [recipeId, existing, existingIngredients])

  const totals = potTotals(items, servings)
  const ready = name.trim().length > 0
  const replacingIngredient = items.find((item) => item.key === pickingIngredient?.replacingKey)

  const touch = () => setDirty(true)

  /**
   * The two refusals, shown and swallowed. Anything else is re-thrown for the
   * caller's own "we could not read it" message.
   *
   * They used to be answered differently, a toast for one and a silent push to
   * the paywall for the other, and both were wrong the same way: a paywall with
   * no statement of what failed reads as the app deciding to sell something, and
   * a message with no way to act on it leaves the user to find the paywall.
   */
  const showRefusal = (error: unknown): boolean => announceRefusal(toast, error, 'read_recipe')

  /**
   * A photo of the pot: attach it, then read it. The upload has to finish before
   * the read starts and both before the form is filled, so this is one sequence.
   * A failure at either step leaves the form as it was, with the photograph
   * attached if it got that far.
   */
  const readPhoto = async (uri: string) => {
    setReading('photo')
    const key = await attachPhoto(uri)
    if (!mounted.current) return
    if (!key) {
      setReading(null)
      toast.show({ title: t('recipes:new.scanFailed'), tone: 'warning' })
      return
    }

    let draft: ScannedRecipe | null
    try {
      draft = await read.mutateAsync({ photoPath: key })
    } catch (error) {
      if (!mounted.current) return
      if (showRefusal(error)) return
      draft = null
    } finally {
      if (mounted.current) setReading(null)
    }
    if (!mounted.current) return
    if (!draft) {
      toast.show({ title: t('recipes:new.scanFailed'), tone: 'warning' })
      return
    }

    applyDraft(draft)
  }

  /**
   * A picture into the form: upload it, put it on the row, drop the drawing.
   * Shared by the "Photo" tile that also reads the pot and the picker that only
   * changes the picture, so the two cannot drift on the orphan sweep. Answers the
   * key, or null when the upload failed, and the caller says so.
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
      if (mounted.current) setLocalPhoto(null)
      return null
    } finally {
      if (mounted.current) setAttaching(false)
    }

    // The cook closed the screen while the upload was in flight, so nothing
    // will ever save or sweep this object unless we remove it here.
    if (!mounted.current) {
      removeMealPhoto(key).catch(() => {})
      return null
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
   * The pot in words: read it, then fill the form. Shorter than the photo path by
   * exactly the upload; everything after the model call is the same, hence
   * `applyDraft`.
   */
  const readText = async (described: string) => {
    setReading('text')
    let draft: ScannedRecipe | null
    try {
      draft = await read.mutateAsync({ text: described })
    } catch (error) {
      if (!mounted.current) return
      if (showRefusal(error)) return
      draft = null
    } finally {
      if (mounted.current) setReading(null)
    }
    if (!mounted.current) return
    if (!draft) {
      toast.show({ title: t('recipes:new.describeFailed'), tone: 'warning' })
      return
    }
    applyDraft(draft)
  }

  /**
   * Apply an AI-read draft into the form without overwriting any field that
   * already has a value. Shared by both the photo and describe paths so neither
   * can drift on which fields it fills.
   */
  const applyDraft = (draft: ScannedRecipe) => {
    touch()
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

  const startedRead = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once for the staged read handed from the Recipes tab
  useEffect(() => {
    if (!initialRead || startedRead.current) return
    startedRead.current = true
    clearRecipeRead(initialRead)
    if (initialRead.kind === 'photo') void readPhoto(initialRead.uri)
    else void readText(initialRead.text)
  }, [initialRead])

  const commit = async () => {
    // Save stays live without a name and says why here: a dead button at the
    // foot of a long form explains nothing, and the name is off screen by then.
    if (!ready) {
      toast.show({ title: t('recipes:edit.nameRequired'), tone: 'warning' })
      nameField.current?.focus()
      return
    }
    // Checked here rather than left to the column's check, which would refuse
    // the whole save with an error that names nothing on screen.
    const sourceUrl = normaliseSourceUrl(source)
    if (source.trim() && !sourceUrl) {
      setSourceError(t('recipes:edit.sourceInvalid'))
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
        prepMinutes: parseMinutes(prep),
        cookMinutes: parseMinutes(cook),
        tags,
        sourceUrl,
      })
    } catch (error) {
      // The free tier's ceiling, met at the write rather than the button. The
      // plus button checks the count first, so what is left is a third recipe
      // saved on another phone, or a form opened before a subscription lapsed.
      // `recipes_enforce_free_limit` raises a token rather than a sentence, so
      // the words are ours and the answer is the paywall.
      if (isRecipeLimit(error)) {
        // Through `openPaywall` rather than three lines here, so the toast comes
        // from the top like every other one that opens this screen — the
        // paywall's buy button is a footer, and a bottom toast lands on it.
        openPaywall(toast, {
          title: t('recipes:edit.limitReached', { count: FREE_RECIPES }),
          feature: 'new_recipe',
        })
        return
      }
      // Stay on the form. Everything the user typed is still staged, so Save is
      // the retry — navigating away on a failed write would lose the lot and
      // leave them looking at the old recipe wondering what happened.
      toast.show({ title: t('recipes:edit.saveFailed'), tone: 'error' })
      return
    }

    toast.show({ title: t('recipes:edit.saved'), tone: 'success' })

    // An edit goes back to the recipe page that opened it, which the save has
    // already refreshed. That page holds the log sheet's day, and a fresh one
    // pushed in its place would log into today instead. Only that page, by its
    // row id, in this group's own stack: a form opened cold has nothing under
    // it to go back to, and a page opened by share slug is cached under the
    // slug, which the save does not refresh.
    const state = navigation.getState()
    const below = state && state.index > 0 ? state.routes[state.index - 1] : undefined
    const belowId = (below?.params as { id?: string } | undefined)?.id
    if (recipeId && below?.name === '[id]' && belowId === result.id) {
      navigation.goBack()
      return
    }
    // `replace`, so the back gesture from the recipe lands on the list rather
    // than on the form that no longer has anything to save.
    router.replace({ pathname: '/recipe/[id]', params: { id: result.id } })
  }

  const leave = () => {
    if (dirty) setLeaving(true)
    else goBack()
  }

  return (
    <Screen
      gestureScroll
      header={
        <AppBar
          title={recipeId ? t('recipes:edit.title') : t('recipes:new.title')}
          onBack={leave}
          leading="dismiss"
          backLabel={t('common:a11y.close')}
        />
      }
      footer={
        !reading ? (
          <View className="gap-2">
            {/* The preview. Reads the staged values, so it cannot disagree
                with what Save is about to write. */}
            {items.length > 0 ? (
              <Text variant="label" className="text-center">
                {/* With the servings beside it, so a pot for four left at the
                    default of one stands out here rather than in the diary. */}
                {t('recipes:edit.perServing', {
                  kcal: totals.perServing.kcal.toLocaleString(),
                  count: servings,
                })}
              </Text>
            ) : null}
            <Button fullWidth loading={save.isPending} onPress={commit}>
              {t('recipes:edit.save')}
            </Button>
          </View>
        ) : undefined
      }
    >
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
          {/* The picture first, as on the recipe itself: it is the biggest
              thing there, and the form reads as the page it will become. */}
          <RecipePicture
            icon={icon}
            photoPath={photoPath}
            localPhoto={localPhoto}
            attaching={attaching}
            onPress={() => setPicking(true)}
          />

          <TextField
            ref={nameField}
            label={t('recipes:edit.name')}
            value={name}
            onChangeText={(next) => {
              setName(next)
              touch()
            }}
            placeholder={t('recipes:edit.namePlaceholder')}
          />

          {/* Three short answers in one card, the way onboarding asks for a
              body: how many it feeds, and how long it takes to get there. */}
          <FormCard>
            <FormRow label={t('recipes:edit.servingsRow')}>
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
                className="w-[150px]"
              />
            </FormRow>
            <FormRow label={t('recipes:edit.prep')}>
              <MinutesField
                label={t('recipes:edit.prep')}
                value={prep}
                onChange={(next) => {
                  setPrep(next)
                  touch()
                }}
              />
            </FormRow>
            <FormRow label={t('recipes:edit.cook')}>
              <MinutesField
                label={t('recipes:edit.cook')}
                value={cook}
                onChange={(next) => {
                  setCook(next)
                  touch()
                }}
              />
            </FormRow>
          </FormCard>

          <View className="gap-1.5">
            <Text variant="label">{t('recipes:edit.meal')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {RECIPE_TAGS.map((tag) => {
                const selected = tags.includes(tag)
                return (
                  <Chip
                    key={tag}
                    selected={selected}
                    onPress={() => {
                      // Kept in the chips' order rather than the order tapped,
                      // so the recipe's own tags read the same way every time.
                      setTags((current) =>
                        RECIPE_TAGS.filter((key) =>
                          key === tag ? !selected : current.includes(key),
                        ),
                      )
                      touch()
                    }}
                  >
                    {t(`recipes:tag.${tag}`)}
                  </Chip>
                )
              })}
            </View>
          </View>

          <View className="gap-1.5">
            <Text variant="label">
              {items.length
                ? t('recipes:edit.ingredientsCount', { count: items.length })
                : t('recipes:edit.ingredients')}
            </Text>

            <RecipeIngredientEditor
              ingredients={items}
              onAmountChange={(key, amount) => {
                setItems((current) =>
                  current.map((item) => (item.key === key ? { ...item, amount } : item)),
                )
                touch()
              }}
              units={settings?.units}
              onUnitChange={(key, displayUnit) => {
                setItems((current) =>
                  current.map((item) => (item.key === key ? { ...item, displayUnit } : item)),
                )
                touch()
              }}
              onAdd={() => setPickingIngredient({})}
              onRemove={(ingredient) => {
                setItems((current) => current.filter((item) => item.key !== ingredient.key))
                touch()
              }}
              onReplace={(ingredient) => setPickingIngredient({ replacingKey: ingredient.key })}
            />
          </View>

          <StepsField
            value={steps}
            onChange={(next) => {
              setSteps(next)
              touch()
            }}
          />

          {/* Where it came from: a reel, a post, a blog. Shown back to the
              cook alone, so it is a bookmark rather than a credit line. */}
          <TextField
            label={t('recipes:edit.source')}
            value={source}
            onChangeText={(next) => {
              setSource(next)
              setSourceError(undefined)
              touch()
            }}
            placeholder={t('recipes:edit.sourcePlaceholder')}
            error={sourceError}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            leftSlot={<Icon set="ui" name="link" size={20} />}
          />

          <IconPicker
            visible={picking}
            onClose={() => setPicking(false)}
            selected={icon ?? undefined}
            // Held back for the confirmation below when there is a photo to lose.
            onSelect={(next) => (photoPath || localPhoto ? setPendingIcon(next) : applyIcon(next))}
            // The other way to answer the same question, in the same sheet. It
            // only changes the PICTURE: reading the pot out of a photograph is
            // what the "Photo" tile on the Recipes tab does, and doing it here
            // too would refill a form the cook has already been through.
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
            visible={pickingIngredient !== null}
            onClose={() => setPickingIngredient(null)}
            replacing={replacingIngredient?.name}
            onAdd={(input) => {
              setItems((current) =>
                replacingIngredient
                  ? current.map((item) =>
                      item.key === replacingIngredient.key
                        ? { ...input, key: replacingIngredient.key }
                        : item,
                    )
                  : [...current, stage(input)],
              )
              touch()
            }}
          />
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
 * The picture, in whichever state it is in: a local file still uploading, a key
 * in the bucket, or a drawing. No empty state and no "add a picture" prompt,
 * because the form opens with `DEFAULT_RECIPE_ICON` in it.
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
   * The box is tall when a photograph is in it, and the test has to agree with
   * what the body draws: the photo wins there, so it wins here.
   *
   * Asking `&& !icon` as well is what the logged-entry screen does and is wrong
   * here: this form clears one when the other is chosen, but a recipe saved
   * before it existed can carry both, and that row drew its photograph inside the
   * short box.
   *
   * `resolvingPhoto` counts as having one: the recipe has a photograph and we are
   * waiting on a URL. Left out, the box opens short and grows by 130pt.
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
      {/* Says the box is a control: a grey box with a drawing in it reads as a
          picture, not as a place to change one. */}
      {attaching ? null : (
        <View className="absolute bottom-2 right-2 flex-row items-center gap-1.5 rounded-full bg-inverse/90 px-3 py-1">
          <Icon set="ui" name="edit" size={14} />
          <Text variant="caption" className="text-on-inverse">
            {t('edit.change')}
          </Text>
        </View>
      )}
    </Tappable>
  )
}

/**
 * Minutes, typed. Digits only and at most four of them: the column takes two
 * days at most, and `parseMinutes` clamps whatever gets past this.
 */
function MinutesField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  const { t } = useTranslation('recipes')
  return (
    <TextField
      size="sm"
      hideLabel
      label={label}
      containerClassName="w-[124px]"
      keyboardType="number-pad"
      maxLength={4}
      value={value}
      onChangeText={(next) => onChange(next.replace(/[^0-9]/g, ''))}
      rightSlot={<Text variant="caption">{t('edit.minutes')}</Text>}
    />
  )
}
