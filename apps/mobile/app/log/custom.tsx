import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import {
  type IconRef,
  MEALS,
  type Meal,
  type Place,
  uploadMealPhoto,
  useCreateFood,
  useLogFood,
  useSelectedDate,
  useTargets,
  useUserId,
} from '@/data'
import { IconPicker } from '@/features/logging'
import { MacroBars } from '@/features/shared'
import { useBack, useDismissTo } from '@/lib/navigation'
import {
  AppBar,
  Button,
  Card,
  Chip,
  Icon,
  Screen,
  SegmentedControl,
  Text,
  TextField,
  useToast,
} from '@/ui'

const PLACES: Place[] = ['mamak', 'kopitiam', 'hawker', 'packaged', 'home']

/** What a dish starts as before the user picks something better. */
const DEFAULT_ICON: IconRef = { set: 'dishes', name: 'nasi-campur' }

/**
 * L7 CUSTOM FOOD.
 *
 * The escape hatch from search: a dish the catalogue does not have, which for a
 * home-cooked meal it never will. The result is a real catalogue entry for this
 * user — it can be logged now, and it comes back in search tomorrow.
 *
 * The database models the same thing as a `foods` row with `owner_id` set, on
 * the same table as the shared catalogue, which is why nothing downstream of
 * here has to know the difference.
 */
export default function CustomFoodScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const goBack = useBack('/today')
  const finish = useDismissTo('/today')
  const toast = useToast()
  const createFood = useCreateFood()
  const logFood = useLogFood()
  const { data: targets } = useTargets()
  const { selectedDate } = useSelectedDate()
  const userId = useUserId()

  const params = useLocalSearchParams<{ meal?: Meal; name?: string }>()

  // Prefilled from whatever the user searched for and could not find, so the
  // typing they already did is not thrown away.
  const [name, setName] = useState(params.name ?? '')
  const [servingLabel, setServingLabel] = useState('')
  const [kcal, setKcal] = useState('')
  const [carbs, setCarbs] = useState('')
  const [protein, setProtein] = useState('')
  const [fat, setFat] = useState('')
  const [place, setPlace] = useState<Place>('home')
  const [icon, setIcon] = useState<IconRef>(DEFAULT_ICON)
  // The local file until the dish is saved; the upload happens on save, so a
  // form that is abandoned leaves nothing in the bucket.
  const [imageUri, setImageUri] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [meal, setMeal] = useState<Meal>(params.meal ?? 'lunch')
  const [pickingIcon, setPickingIcon] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Blank is 0, not NaN — the three macros are optional, and a dish saved with
  // only its calories is a perfectly good dish.
  const number = (value: string) => {
    const parsed = Number.parseFloat(value.replace(',', '.'))
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  }

  const macros = {
    kcal: Math.round(number(kcal)),
    carbs: number(carbs),
    protein: number(protein),
    fat: number(fat),
  }

  const nameError = !name.trim()
  const kcalError = macros.kcal <= 0
  // Errors appear on the first save attempt rather than on the first keystroke:
  // a form that turns red while you are still filling it in is nagging.
  const showErrors = submitted

  const uploadPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // Square, because every place this shows up — the row tile, the detail
      // hero — is square, and cropping now beats cropping in six components.
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    })
    if (result.canceled) return
    setImageUri(result.assets[0]?.uri)
  }

  const save = async (thenLog: boolean) => {
    setSubmitted(true)
    if (nameError || kcalError || saving) return

    setSaving(true)
    try {
      // Uploaded before the row that names it: a dish pointing at an object
      // that failed to upload is worse than a dish with no picture.
      const imagePath = imageUri ? await uploadMealPhoto(userId, imageUri) : undefined

      const food = await createFood.mutateAsync({
        name,
        place,
        // The serving is what the user calls one of them; "1 serving" is the
        // honest default rather than guessing a plate or a bowl.
        servingLabel: servingLabel.trim() || t('logging:custom.servingDefault'),
        macros,
        icon,
        imagePath,
      })

      if (thenLog) {
        await logFood.mutateAsync({
          foodId: food.id,
          servingId: food.servings[0]?.id ?? '',
          meal,
          logDate: selectedDate,
          source: 'quickAdd',
        })
        finish()
        return
      }

      toast.show({
        title: t('logging:custom.saved', { name: food.name }),
        tone: 'success',
        icon: { set: 'ui', name: 'check' },
      })
      goBack()
    } catch (error) {
      toast.show({
        title: error instanceof Error ? error.message : t('common:action.retry'),
        tone: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen
      footer={
        <View className="gap-2.5">
          <Button fullWidth onPress={() => save(true)} loading={saving}>
            {t('logging:custom.saveAndAdd')}
          </Button>
          <Button variant="ghost" fullWidth onPress={() => save(false)} disabled={saving}>
            {t('logging:custom.saveOnly')}
          </Button>
        </View>
      }
    >
      <AppBar
        title={t('logging:custom.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      <Text variant="meta">{t('logging:custom.intro')}</Text>

      <Card>
        <View className="h-[130px] items-center justify-center overflow-hidden rounded-card border-[3px] border-line bg-track">
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{ flex: 1, width: '100%' }}
              contentFit="cover"
              accessibilityLabel={t('logging:custom.photoAlt')}
            />
          ) : (
            <Icon {...icon} size={100} />
          )}
        </View>

        <View className="flex-row gap-2.5">
          <Button
            variant="secondary"
            className="flex-1"
            leftIcon={<Icon set="system" name="sparkle" size={20} />}
            onPress={() => setPickingIcon(true)}
          >
            {t('logging:custom.chooseIcon')}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            leftIcon={<Icon set="system" name="photo" size={20} />}
            onPress={uploadPhoto}
          >
            {t('logging:custom.uploadPhoto')}
          </Button>
        </View>

        {imageUri ? (
          <Button variant="ghost" fullWidth onPress={() => setImageUri(undefined)}>
            {t('logging:custom.removePhoto')}
          </Button>
        ) : null}
      </Card>

      <Card>
        <TextField
          label={t('logging:custom.name')}
          value={name}
          onChangeText={setName}
          placeholder={t('logging:custom.namePlaceholder')}
          error={showErrors && nameError ? t('logging:custom.nameRequired') : undefined}
          autoFocus={!params.name}
          returnKeyType="next"
        />

        <TextField
          label={t('logging:custom.serving')}
          value={servingLabel}
          onChangeText={setServingLabel}
          placeholder={t('logging:custom.servingPlaceholder')}
          hint={t('logging:custom.servingHint')}
          returnKeyType="next"
        />
      </Card>

      <Card title={t('logging:custom.macrosLabel')}>
        <TextField
          label={t('common:unit.kcalUpper')}
          value={kcal}
          onChangeText={setKcal}
          placeholder="450"
          keyboardType="numeric"
          error={showErrors && kcalError ? t('logging:custom.kcalRequired') : undefined}
        />

        <View className="flex-row gap-2.5">
          <TextField
            containerClassName="flex-1"
            label={t('common:macro.carbs')}
            value={carbs}
            onChangeText={setCarbs}
            placeholder="0"
            keyboardType="numeric"
          />
          <TextField
            containerClassName="flex-1"
            label={t('common:macro.protein')}
            value={protein}
            onChangeText={setProtein}
            placeholder="0"
            keyboardType="numeric"
          />
          <TextField
            containerClassName="flex-1"
            label={t('common:macro.fat')}
            value={fat}
            onChangeText={setFat}
            placeholder="0"
            keyboardType="numeric"
          />
        </View>

        {/* The same bars the food detail draws, so the numbers being typed can
            be sanity-checked against the day's targets before saving. */}
        {targets ? <MacroBars eaten={macros} targets={targets} /> : null}
      </Card>

      <Card title={t('logging:custom.placeLabel')}>
        <View className="flex-row flex-wrap gap-2">
          {PLACES.map((option) => (
            <Chip key={option} selected={place === option} onPress={() => setPlace(option)}>
              {t(`logging:search.place.${option}`)}
            </Chip>
          ))}
        </View>
      </Card>

      <Card title={t('logging:detail.mealLabel')}>
        <SegmentedControl
          options={MEALS.map((option) => ({ value: option, label: t(`common:meal.${option}`) }))}
          value={meal}
          onChange={setMeal}
          accessibilityLabel={t('logging:detail.mealLabel')}
        />
      </Card>

      <IconPicker
        visible={pickingIcon}
        onClose={() => setPickingIcon(false)}
        value={icon}
        onChange={setIcon}
      />
    </Screen>
  )
}
