import { FREE_RECIPES } from '@ricecal/shared'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  ScrollView,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native'

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
  FormSection,
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
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Aside,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  cn,
  Icon,
  Screen,
  Skeleton,
  Tappable,
  TEXT_SCALES,
  Text,
  TextField,
  useNumpadField,
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
  const { t } = useTranslation(['recipes', 'common', 'paywall', 'profile', 'logging'])
  const router = useRouter()
  const navigation = useNavigation()
  const goBack = useBack('/recipes')
  const toast = useToast()

  const params = useLocalSearchParams<{ id?: string; read?: string; date?: string }>()
  const recipeId = params.id
  const { data: existing, isPending: recipePending } = useRecipe(recipeId)
  const { data: existingIngredients, isPending: ingredientsPending } =
    useRecipeIngredients(recipeId)
  const { data: settings } = useSettings()
  const loadingExisting = Boolean(recipeId && (recipePending || ingredientsPending))

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
  const afterPicker = useRef<(() => void) | null>(null)
  const discardingRef = useRef(false)

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
  const savedRef = useRef(false)
  const savingRef = useRef(false)
  const photoPathRef = useRef<string | null>(null)
  photoPathRef.current = photoPath
  const existingPhotoRef = useRef<string | null | undefined>(undefined)
  existingPhotoRef.current = existing?.photoPath
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // Sweep a newly uploaded session photo if the user leaves without saving
      // (skip while a save is still in flight so we never delete a photo the
      // recipe row is about to reference).
      const staged = photoPathRef.current
      if (
        !savedRef.current &&
        !savingRef.current &&
        staged &&
        staged !== existingPhotoRef.current
      ) {
        removeMealPhoto(staged).catch(() => {})
      }
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

    pictureChosen.current = true
    touch()
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
    if (attaching) return
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
      toast.show({ title: t('recipes:edit.sourceInvalid'), tone: 'warning' })
      return
    }

    let result: Awaited<ReturnType<typeof save.mutateAsync>>
    savingRef.current = true
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
      savingRef.current = false
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

    savingRef.current = false
    savedRef.current = true
    toast.show({ title: t('recipes:edit.saved'), tone: 'success' })

    // An edit goes back to the recipe page that opened it, which the save has
    // already refreshed (both row id and share slug caches). That page holds
    // the log sheet's day, and a fresh one pushed in its place would log into
    // today instead.
    const state = navigation.getState()
    const below = state && state.index > 0 ? state.routes[state.index - 1] : undefined
    const belowId = (below?.params as { id?: string } | undefined)?.id
    if (
      recipeId &&
      below?.name === '[id]' &&
      (belowId === result.id || (existing?.shareSlug && belowId === existing.shareSlug))
    ) {
      navigation.goBack()
      return
    }
    // `replace`, so the back gesture from the recipe lands on the list rather
    // than on the form that no longer has anything to save.
    router.replace({
      pathname: '/recipe/[id]',
      params: { id: result.id, ...(params.date ? { date: params.date } : {}) },
    })
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
        !reading && !loadingExisting ? (
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
            <Button fullWidth loading={save.isPending || attaching} onPress={commit}>
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
      ) : loadingExisting ? (
        <View className="gap-4">
          <Skeleton className="h-[130px] w-full" />
          <Skeleton className="h-[52px] w-full" />
          <Skeleton className="h-[140px] w-full" />
        </View>
      ) : (
        <>
          {/* What the recipe is, in one card: the picture beside the name, as
              on the recipe page, and the three short answers under them. It
              was a 130pt grey box, a field, and a card of rows with three
              different controls, before a single ingredient. */}
          <Card contentClassName="gap-4">
            <View className="flex-row items-center gap-4">
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
                hideLabel
                containerClassName="min-w-0 flex-1"
                value={name}
                onChangeText={(next) => {
                  setName(next)
                  touch()
                }}
                placeholder={t('recipes:edit.namePlaceholder')}
                maxLength={120}
              />
            </View>

            <View className="flex-row gap-2">
              <DetailTile label={t('recipes:edit.serves')}>
                <ServingsControl
                  value={servings}
                  onChange={(next) => {
                    setServings(next)
                    touch()
                  }}
                />
              </DetailTile>
              <MinutesTile
                title={t('recipes:edit.prepShort')}
                label={t('recipes:edit.prep')}
                value={prep}
                onChange={(next) => {
                  setPrep(next)
                  touch()
                }}
              />
              <MinutesTile
                title={t('recipes:edit.cookShort')}
                label={t('recipes:edit.cook')}
                value={cook}
                onChange={(next) => {
                  setCook(next)
                  touch()
                }}
              />
            </View>
          </Card>

          {/* One row that scrolls rather than two that wrap: six short tags
              took two lines of the screen and read as two groups. Bled to the
              screen edge so the clipped last chip says there is more. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel={t('recipes:edit.meal')}
            className="-mx-gutter grow-0"
            contentContainerClassName="flex-row gap-2 px-gutter"
          >
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
          </ScrollView>

          {/* With two panes, what the recipe is stays on the left and the
              cooking (ingredients and method) goes on the right, as on the
              recipe page. The source, last on a phone, stays on the left. */}
          <Aside>
            <FormSection
              title={t('recipes:edit.ingredients')}
              meta={items.length ? String(items.length) : undefined}
              action={
                items.length ? (
                  <Text variant="bodyStrong">
                    {t('logging:detail.partKcal', { kcal: totals.total.kcal.toLocaleString() })}
                  </Text>
                ) : undefined
              }
            >
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
            </FormSection>

            <StepsField
              value={steps}
              onChange={(next) => {
                setSteps(next)
                touch()
              }}
            />
          </Aside>

          {/* Where it came from: a reel, a post, a blog. Shown back to the
              cook alone, so it is a bookmark rather than a credit line. */}
          <FormSection title={t('recipes:edit.source')}>
            <TextField
              label={t('recipes:edit.source')}
              hideLabel
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
          </FormSection>

          <IconPicker
            visible={picking}
            onClose={() => setPicking(false)}
            onDismiss={() => {
              const next = afterPicker.current
              afterPicker.current = null
              next?.()
            }}
            selected={icon ?? undefined}
            // Held back for the confirmation below when there is a photo to lose,
            // deferred until IconPicker's own Modal finishes dismissing on iOS.
            onSelect={(next) => {
              if (photoPath || localPhoto) {
                afterPicker.current = () => setPendingIcon(next)
              } else {
                applyIcon(next)
              }
            }}
            // The other way to answer the same question, in the same sheet. It
            // only changes the PICTURE: reading the pot out of a photograph is
            // what the "Photo" tile on the Recipes tab does, and doing it here
            // too would refill a form the cook has already been through.
            onPickPhoto={(uri) => {
              void attachPhoto(uri).then((key) => {
                if (!key && mounted.current) {
                  toast.show({ title: t('profile:account.photoFailed'), tone: 'warning' })
                }
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
        onDismiss={() => {
          if (discardingRef.current) {
            discardingRef.current = false
            goBack()
          }
        }}
        title={t('recipes:edit.discardTitle')}
        description={t('recipes:edit.discardBody')}
        confirmLabel={t('recipes:edit.discardConfirm')}
        cancelLabel={t('common:action.cancel')}
        tone="danger"
        onConfirm={() => {
          discardingRef.current = true
          setLeaving(false)
        }}
      />
    </Screen>
  )
}

/**
 * The picture, in whichever state it is in: a local file still uploading, a key
 * in the bucket, or a drawing. No empty state and no "add a picture" prompt,
 * because the form opens with `DEFAULT_RECIPE_ICON` in it.
 *
 * A square beside the name, photo or drawing alike. The recipe page gives a
 * photograph the full width; here it only has to say which picture is chosen.
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

  return (
    <Tappable
      onPress={onPress}
      disabled={attaching}
      accessibilityRole="button"
      accessibilityLabel={t('edit.changePicture')}
    >
      <View className="h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-md bg-track">
        {attaching ? (
          // The upload resizes and encodes a 3-6MB frame before it sends it, so
          // this is a second or two on a real photo — long enough that a tile
          // which did not change would read as the camera having done nothing.
          <ActivityIndicator />
        ) : photo ? (
          <MealPhoto source={photo} />
        ) : resolvingPhoto ? (
          /* This recipe HAS a photograph and it is still being signed for.
             Without this the tile drew the drawing first and then replaced it
             with the photograph while being looked at. */
          <Skeleton width="100%" height={84} rounded={false} className="bg-line" />
        ) : (
          <Icon {...(icon ?? DEFAULT_RECIPE_ICON)} size={60} />
        )}
      </View>
      {/* Says the tile is a control: a drawing in a box reads as a picture,
          not as a place to change one. */}
      {attaching ? null : (
        <View className="absolute -right-1.5 -bottom-1.5 h-[28px] w-[28px] items-center justify-center rounded-full border-[3px] border-surface bg-pandan-soft">
          <Icon set="ui" name="edit" size={13} />
        </View>
      )}
    </Tappable>
  )
}

/** One of the three short answers under the name: a quiet label over a figure. */
function DetailTile({
  label,
  onPress,
  active = false,
  children,
}: {
  label: string
  /** The whole tile focuses its field, rather than only the figure's width. */
  onPress?: () => void
  /** Its field is being typed into: the only sign which tile the pad is filling. */
  active?: boolean
  children: ReactNode
}) {
  const body = (
    <>
      <Text variant="meta" numberOfLines={1}>
        {label}
      </Text>
      {/* One height for the figure in every tile, so the servings buttons do
          not push "Serves" above "Prep" and "Cook". */}
      <View className="min-h-[30px] justify-center">{children}</View>
    </>
  )
  const className = cn(
    'min-h-[72px] flex-1 items-center gap-1 rounded-md border-2 bg-track px-1.5 py-2',
    active ? 'border-pandan' : 'border-transparent',
  )
  return onPress ? (
    <Tappable className={className} onPress={onPress} accessible={false}>
      {body}
    </Tappable>
  ) : (
    <View className={className}>{body}</View>
  )
}

/**
 * How many the pot feeds, with a small minus and plus either side. The app's
 * Stepper is sized for a portion on its own row, and beside two minute fields
 * its 56pt green button was the loudest thing on the form.
 */
function ServingsControl({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const { t } = useTranslation(['recipes', 'common'])
  const colors = useThemeColors()
  const button = (direction: -1 | 1) => {
    const next = value + direction
    const disabled = next < MIN_SERVINGS || next > MAX_SERVINGS
    return (
      <Tappable
        onPress={() => onChange(next)}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t(direction < 0 ? 'common:a11y.decrease' : 'common:a11y.increase')}
        accessibilityState={{ disabled }}
        className={cn(
          'h-[28px] w-[28px] items-center justify-center rounded-full bg-surface',
          disabled && 'opacity-40',
        )}
      >
        <Icon set="ui" name={direction < 0 ? 'minus' : 'plus'} size={12} tintColor={colors.ink} />
      </Tappable>
    )
  }
  return (
    <View className="flex-row items-center gap-2">
      {button(-1)}
      <Text
        variant="numeric"
        className="min-w-[24px] text-center"
        accessibilityLabel={`${t('recipes:edit.servingsRow')}, ${value}`}
      >
        {value}
      </Text>
      {button(1)}
    </View>
  )
}

const MIN_SERVINGS = 1
const MAX_SERVINGS = 100

/**
 * Minutes, typed into the tile. Digits only and at most four of them: the
 * column takes two days at most, and `parseMinutes` clamps whatever gets past
 * this. Empty stays empty, drawn as a dash, rather than turning into a 0.
 */
function MinutesTile({
  title,
  label,
  value,
  onChange,
}: {
  /** Drawn on the tile: "Prep". */
  title: string
  /** For the pad's header and a screen reader: "Prep time". */
  label: string
  value: string
  onChange: (next: string) => void
}) {
  const { t } = useTranslation('recipes')
  const colors = useThemeColors()
  const [focused, setFocused] = useState(false)
  const numpad = useNumpadField({
    value,
    onChangeText: (next) => onChange(next.replace(/[^0-9]/g, '')),
    decimal: false,
    maxLength: 4,
    label,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  })
  return (
    <DetailTile label={title} active={focused} onPress={() => numpad.ref.current?.focus()}>
      <View className="flex-row items-baseline gap-1">
        <TextInput
          allowFontScaling={TEXT_SCALES}
          value={value}
          onChangeText={(next) => onChange(next.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={4}
          // A lone dash for a time nobody gave, as the recipe page leaves it out.
          placeholder="—"
          placeholderTextColor={colors.faint}
          accessibilityLabel={label}
          className="min-w-[24px] p-0 text-center font-display text-[22px] text-heading"
          cursorColor={colors.pandan}
          selectionColor={colors.pandan}
          {...numpad}
        />
        <Text variant="meta">{t('edit.minutes')}</Text>
      </View>
    </DetailTile>
  )
}
