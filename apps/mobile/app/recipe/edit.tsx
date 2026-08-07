import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

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
import { InlineCamera } from '@/features/logging'
import {
  DescribeRecipePanel,
  IngredientSheet,
  ingredientTotal,
  potTotals,
} from '@/features/recipes'
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
  const { t } = useTranslation(['recipes', 'common'])
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
  const [icon, setIcon] = useState<IconRef | null>(null)
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  /** The picture before it has a key — what the tile shows while it uploads. */
  const [localPhoto, setLocalPhoto] = useState<string | null>(null)
  const [items, setItems] = useState<StagedIngredient[]>([])

  const [dirty, setDirty] = useState(false)
  const [adding, setAdding] = useState(false)
  const [camera, setCamera] = useState(false)
  const [describing, setDescribing] = useState(false)
  /**
   * Which read is in flight, and it exists because nothing else on screen still
   * knows. The describe sheet is dismissed before the call is made, and `filled`
   * is not set until the answer lands, so the banner was reading two pieces of
   * state that are both false for the whole of a typed read and said "Reading
   * your photo…" over somebody's typing.
   */
  const [reading, setReading] = useState<'photo' | 'text' | null>(null)
  // The describe sheet has actually been presented. `autoFocus` inside a
  // `Modal` is applied while the field is still off screen and routinely
  // dropped, so the field waits for `onShow` rather than for `visible`.
  const [describeReady, setDescribeReady] = useState(false)
  const [leaving, setLeaving] = useState(false)
  /**
   * Which way the form was filled in, once it has been. Drives the banner, and
   * it names the SOURCE rather than being a boolean because "filled in from
   * your photo" and "filled in from what you wrote" are different sentences.
   */
  const [filled, setFilled] = useState<'photo' | 'text' | null>(null)

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
    setIcon(existing.icon ?? null)
    setPhotoPath(existing.photoPath ?? null)
    setItems(existingIngredients.map((item) => stage(item)))
  }, [recipeId, existing, existingIngredients])

  const totals = potTotals(items, servings)
  const ready = name.trim().length > 0

  const touch = () => setDirty(true)

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

    setLocalPhoto(uri)
    touch()

    let key: string
    try {
      key = await uploadMealPhoto(uri)
    } catch {
      setLocalPhoto(null)
      toast.show({ title: t('recipes:new.scanFailed'), tone: 'warning' })
      return
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

    setReading('photo')
    let draft: ScannedRecipe | null
    try {
      draft = await read.mutateAsync({ photoPath: key })
    } finally {
      setReading(null)
    }
    if (!draft) {
      toast.show({ title: t('recipes:new.scanFailed'), tone: 'warning' })
      return
    }

    applyDraft(draft, 'photo')
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
    } finally {
      setReading(null)
    }
    if (!draft) {
      toast.show({ title: t('recipes:new.describeFailed'), tone: 'warning' })
      return
    }
    applyDraft(draft, 'text')
  }

  /**
   * A draft into the form, ONLY OVER EMPTY FIELDS.
   *
   * Somebody who typed a name and then reached for the camera meant it to fill
   * in the parts they had not done, not to overwrite the part they had. Shared
   * by both paths so the two cannot drift on which fields they are willing to
   * clobber.
   */
  const applyDraft = (draft: ScannedRecipe, source: 'photo' | 'text') => {
    setFilled(source)
    setName((current) => current || draft.name)
    setSteps((current) => current || draft.steps)
    setServings((current) => (current === 1 ? draft.servings : current))
    setItems((current) => (current.length > 0 ? current : draft.ingredients.map(stage)))
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
        <Button fullWidth loading={save.isPending} disabled={!ready} onPress={commit}>
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

      {/* Two ways to have the form filled in, on a NEW recipe only. Editing
          one, the form is already full and a button that overwrites it is a
          trap.

          Both offered at once rather than behind a chooser: they answer
          different situations, not different preferences. The pot is on the
          stove, or it is not. */}
      {!recipeId && !filled && !read.isPending ? (
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

      {read.isPending ? (
        <Card tone="kaya">
          <Text variant="meta">
            {reading === 'text' ? t('recipes:new.describing') : t('recipes:new.scanning')}
          </Text>
        </Card>
      ) : null}

      {filled && !read.isPending ? (
        <Card tone="pandan">
          <View className="flex-row items-center gap-3">
            <Icon set="ui" name="check" size={18} />
            <Text variant="meta" className="flex-1">
              {filled === 'text' ? t('recipes:new.described') : t('recipes:new.scanned')}
            </Text>
          </View>
        </Card>
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

      <View className="flex-row gap-3">
        <PhotoTile
          icon={icon}
          photoPath={photoPath}
          localPhoto={localPhoto}
          onPress={() => setCamera(true)}
        />

        <View className="min-w-0 flex-1 gap-1.5">
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
            return (
              <View key={item.key}>
                {index > 0 ? <Divider /> : null}
                <View className="flex-row items-center gap-2.5 py-2.5">
                  <View className="min-w-0 flex-1">
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text variant="meta">
                      {item.amount}{' '}
                      {t(`recipes:ingredient.unit.${item.unit}`, { count: item.amount })}
                    </Text>
                  </View>
                  <View className="flex-row items-baseline gap-1">
                    <Text variant="numeric" className="text-[17px] leading-[22px]">
                      {line.kcal.toLocaleString()}
                    </Text>
                    <Text variant="caption">{t('common:unit.kcal')}</Text>
                  </View>
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
              <Text variant="bodyStrong">{t('recipes:edit.totalLabel', { count: servings })}</Text>
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

      <TextField
        label={t('recipes:edit.steps')}
        value={steps}
        onChangeText={(next) => {
          setSteps(next)
          touch()
        }}
        placeholder={t('recipes:edit.stepsPlaceholder')}
        multiline
        numberOfLines={5}
        className="min-h-[120px] items-start py-4"
      />

      <IngredientSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onAdd={(input) => {
          setItems((current) => [...current, stage(input)])
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
 * The picture, in whichever of its three states it is in: a local file still
 * uploading, a key in the bucket, or a drawing the cook picked.
 */
function PhotoTile({
  icon,
  photoPath,
  localPhoto,
  onPress,
}: {
  icon: IconRef | null
  photoPath: string | null
  localPhoto: string | null
  onPress: () => void
}) {
  const { t } = useTranslation('recipes')
  const { data: signedUrl } = useMealPhotoUrl(photoPath ?? undefined)
  const photo = storedImageSource(photoPath ?? undefined, signedUrl, localPhoto ?? undefined)

  return (
    <View className="gap-1.5">
      <Text variant="label">{t('edit.photo')}</Text>
      <Tappable
        className="h-[76px] w-[104px] items-center justify-center overflow-hidden rounded-md border-[3px] border-line bg-track"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('edit.photo')}
      >
        {photo ? (
          <Image source={photo} style={{ flex: 1, width: '100%' }} contentFit="cover" />
        ) : icon ? (
          <Icon {...icon} size={46} />
        ) : (
          <View className="items-center gap-0.5">
            <Icon set="ui" name="plus" size={18} />
            <Text variant="caption">{t('edit.addPhoto')}</Text>
          </View>
        )}
      </Tappable>
    </View>
  )
}
