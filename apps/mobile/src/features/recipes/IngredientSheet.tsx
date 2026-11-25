import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, View } from 'react-native'

import type { Food, Macros, RecipeIngredientInput } from '@/data'
import {
  isStorableAmount,
  isStorablePerUnit,
  storedAmount,
  useFood,
  useFoodSearch,
  useSettings,
} from '@/data'
import { ItemRow } from '@/features/shared'
import {
  type MeasureChoice,
  MeasureList,
  offeredChoices,
  UnitPill,
} from '@/features/shared/MeasurePicker'
import { useMeasureText } from '@/features/shared/useMeasureText'
import { amountText, unitsFor } from '@/lib/measures'
import { useDebouncedValue } from '@/lib/use-debounce'
import { useThemeColors } from '@/theme/useTheme'
import {
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  SearchField,
  Sheet,
  Tappable,
  Text,
  TextField,
} from '@/ui'
import {
  convertIngredient,
  displayUnitFor,
  type IngredientKey,
  ingredientOptions,
  ingredientTotal,
  storedFrom,
  storedUnit,
} from './basis'
import { UnitGroups, useUnitName } from './UnitGroups'

export type IngredientSheetProps = {
  visible: boolean
  onClose: () => void
  /** The finished line, ready to be staged on the form. */
  onAdd: (ingredient: RecipeIngredientInput) => void
  /** The row being swapped, when this picker is replacing rather than adding. */
  replacing?: string
}

/**
 * Which of the three panels is showing.
 *
 * A path, not a set of tabs. Search is where the sheet opens; picking a result
 * leads to `amount`, and the row at the foot of the results leads to `own`.
 * Both of those carry a back control. Tabs were tried and are wrong here: the
 * two ways in are not peers a user chooses between up front — one is "find it"
 * and the other is "it is not in there", which is an answer to having looked.
 */
type Panel = 'search' | 'own' | 'amount'

/**
 * A typed number. The decimal pad shows a comma in comma locales, and
 * `Number('1,5')` is NaN, so the comma is read as the point it means.
 */
const typedNumber = (text: string) => Number(text.replace(',', '.'))

/**
 * Opening the unit picker puts the number pad away first: the picker opens
 * under the field, and with the pad up it opened behind it.
 */
const toggleChoosing = (set: (update: (open: boolean) => boolean) => void) => {
  Keyboard.dismiss()
  set((open) => !open)
}

/** The amount, set as large as the figure it is: the field is mostly this number. */
const AMOUNT_TYPE = 'font-display text-[22px]'

/**
 * Adding one thing to the pot.
 *
 * Two ways in, and they are the same shape at the end: a name, an amount, a
 * unit, and what one unit costs. The difference is only where those numbers
 * come from — the catalogue, or the cook reading a packet.
 *
 * FULL HEIGHT, NO FOOTER, and both are rules rather than choices. A sheet with
 * a text field in it is `fullHeight`: a capped panel is padded up off the
 * bottom edge when the keyboard opens and the strip left behind shows the scrim
 * through the curve of the keyboard's corners. And a footer sits outside the
 * scroll view, so at full height it lands behind the keyboard — the button goes
 * in the body, after the field.
 */
export function IngredientSheet({ visible, onClose, onAdd, replacing }: IngredientSheetProps) {
  const { t } = useTranslation(['recipes', 'logging', 'common'])
  const [panel, setPanel] = useState<Panel>('search')

  // The dish chosen out of the search results, which is the point the sheet
  // stops being a search and starts being "how much of it went in".
  const [pickedId, setPickedId] = useState<string | null>(null)

  const close = () => {
    setPanel('search')
    setPickedId(null)
    onClose()
  }

  const add = (ingredient: RecipeIngredientInput) => {
    onAdd(ingredient)
    close()
  }

  const back = () => {
    setPickedId(null)
    setPanel('search')
  }

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t(replacing ? 'logging:detail.replacePart' : 'recipes:ingredient.title')}
      closeLabel={t('common:action.close')}
      fullHeight
    >
      {panel === 'search' ? (
        <SearchPanel
          onPick={(foodId) => {
            setPickedId(foodId)
            setPanel('amount')
          }}
          onOwn={() => setPanel('own')}
        />
      ) : null}

      {panel === 'amount' && pickedId ? (
        <AmountPanel foodId={pickedId} onBack={back} onAdd={add} replacing={Boolean(replacing)} />
      ) : null}

      {panel === 'own' ? (
        <CustomPanel onBack={back} onAdd={add} replacing={Boolean(replacing)} />
      ) : null}
    </Sheet>
  )
}

/** The catalogue, filtered. Same debounce and the same states as the log sheet's. */
function SearchPanel({ onPick, onOwn }: { onPick: (foodId: string) => void; onOwn: () => void }) {
  const { t } = useTranslation(['recipes', 'logging', 'common'])
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query)
  const { data = [], isFetching } = useFoodSearch(debounced)

  const searched = debounced.trim().length > 0

  return (
    <View className="gap-3">
      <SearchField
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
        clearLabel={t('recipes:search.clear')}
        placeholder={t('recipes:ingredient.search')}
        autoFocus
        returnKeyType="search"
      />

      {searched && data.length === 0 && !isFetching ? (
        <EmptyState
          title={t('recipes:search.none')}
          description={t('recipes:ingredient.ownBody')}
          icon={{ set: 'ui', name: 'search' }}
        />
      ) : null}

      {data.map((food) => (
        <Card key={food.id}>
          <ItemRow
            title={food.name}
            // Same list, same catalogue, same reason as the log sheet's search
            // results: most rows carry a drawing now. Left text-only here it
            // would be the one place in the app where picking a food shows less
            // than picking the same food next door.
            icon={food.icon}
            detail={food.servingLabel}
            value={food.macros.kcal}
            unit={t('common:unit.kcal')}
            onPress={() => onPick(food.id)}
          />
        </Card>
      ))}

      {/* At the FOOT of the results, not beside the field. It is the answer to
          having looked and not found it, so it belongs after the looking. */}
      <Tappable
        onPress={onOwn}
        className="flex-row items-center gap-3 rounded-tile border-[3px] border-line border-dashed p-4"
        accessibilityRole="button"
        accessibilityLabel={t('recipes:ingredient.ownTitle')}
      >
        <View className="h-[42px] w-[42px] items-center justify-center rounded-md bg-pandan-soft">
          <Icon set="ui" name="plus" size={20} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="bodyStrong">{t('recipes:ingredient.ownTitle')}</Text>
          <Text variant="meta">{t('recipes:ingredient.ownBody')}</Text>
        </View>
        <Icon set="ui" name="chevron-right" size={18} />
      </Tappable>
    </View>
  )
}

/**
 * How much of the chosen dish went in, in whichever unit the cook measured it,
 * and what that much costs.
 *
 * The amount is prefilled with the serving the catalogue quoted, in the unit it
 * was quoted in (see `ingredientOptions`), so the calorie figure on the row the
 * user just tapped is the calorie figure they see here before changing
 * anything. A picker that opened at zero would make them do the arithmetic
 * twice.
 *
 * Changing the unit converts what is in the field rather than keeping the
 * number: 400 g of milk becomes 1.64 cups, where keeping "400" would be 400 cups.
 */
function AmountForm({
  food,
  action,
  onSubmit,
}: {
  food: Food
  action: string
  onSubmit: (ingredient: RecipeIngredientInput) => void
}) {
  const { t } = useTranslation(['recipes', 'common', 'logging'])
  const unitName = useUnitName()
  const measureText = useMeasureText()
  const units = useSettings().data?.units
  const { choices, initial } = ingredientOptions(food, units)

  // Null until they pick one, like the amount below, so the opening unit and
  // the opening amount are read from the same render. Frozen at mount, the unit
  // stayed grams while settings arrived and turned the prefill into ounces:
  // "3 g" for three ounces.
  const [picked, setPicked] = useState<IngredientKey | null>(null)
  /** Whether the unit picker is open under the field. */
  const [choosing, setChoosing] = useState(false)
  // Null until they touch it, so the field shows the prefill without that
  // prefill becoming a string the moment the component mounts.
  const [amount, setAmount] = useState<string | null>(null)

  const key = picked ?? initial.key
  const choice = choices.find((c) => c.key === key) ?? choices[0]
  const value = amount === null ? initial.amount : typedNumber(amount)
  const stored = storedFrom(value, choice.key)
  const usable = Number.isFinite(value) && isStorableAmount(stored)
  const line = ingredientTotal(choice.perUnit, usable ? storedAmount(stored) : 0)

  const switchTo = (next: IngredientKey) => {
    const target = choices.find((c) => c.key === next)
    if (!target || next === choice.key) return
    setPicked(next)
    if (Number.isFinite(value) && value > 0) {
      setAmount(amountText(convertIngredient(value, choice, target)))
    }
  }

  // Each unit as the amount it would read as and what that costs. Built here
  // rather than inside the list, because whether the pill is a control at all
  // depends on how many of them are offered.
  const unitChoices: MeasureChoice[] = choices.map((target) => {
    const converted =
      target.key === choice.key || !(value > 0) ? value : convertIngredient(value, choice, target)
    // How much food the converted figure is against the figure in the
    // field, in base servings: a unit that would round it by more
    // than 2.5% (10 g as 0.01 kg) is left off the list.
    const eatenNow = value * choice.servings
    const eatenThen = converted * target.servings
    return {
      key: target.key,
      disabled:
        target.key !== choice.key &&
        eatenNow > 0 &&
        Math.abs(eatenThen - eatenNow) > eatenNow * 0.025,
      title:
        target.key === 'piece'
          ? `${amountText(converted)} ${unitName('piece', converted)}`
          : measureText.amount(converted, target.key),
      detail: t('logging:detail.partKcal', {
        kcal: ingredientTotal(
          target.perUnit,
          storedAmount(storedFrom(converted, target.key)),
        ).kcal.toLocaleString(),
      }),
      selected: target.key === choice.key,
      onPress: () => {
        switchTo(target.key)
        setChoosing(false)
      },
    }
  })
  // Typing can take the other units out of reach (5 g as kilograms rounds by
  // a fifth), and then the pill and its list go with them.
  const canPickUnit = offeredChoices(unitChoices).length > 1

  return (
    <>
      <TextField
        label={t('recipes:ingredient.amount')}
        value={amount === null ? amountText(initial.amount) : amount}
        onChangeText={(text) => {
          // The unit is pinned at the first keystroke: while nothing was
          // picked it followed the opening unit, which moves when settings
          // arrive, and 200 typed as grams became 200 ounces.
          if (picked === null) setPicked(key)
          setAmount(text)
        }}
        keyboardType="decimal-pad"
        selectTextOnFocus
        inputClassName={AMOUNT_TYPE}
        rightSlot={
          canPickUnit ? (
            <UnitPill
              label={unitName(choice.key, value)}
              open={choosing}
              onPress={() => toggleChoosing(setChoosing)}
              accessibilityLabel={t('recipes:ingredient.unitTitle')}
            />
          ) : (
            <Text variant="label" className="text-muted">
              {unitName(choice.key, value)}
            </Text>
          )
        }
      />

      {/* Each unit as the amount it would read as and what that costs, the
          same list the food page and an ingredient row open: picking one
          converts, so the result is shown before it is picked. */}
      {choosing && canPickUnit ? (
        <View className="rounded-md border-[3px] border-line bg-surface px-4">
          <MeasureList choices={unitChoices} />
        </View>
      ) : null}

      {/* The point of the whole panel: the number moves as the amount is
          typed, so what the button commits is what was being read. */}
      <Card>
        <View className="flex-row items-baseline justify-between">
          <Text variant="bodyStrong">{t('recipes:ingredient.calories')}</Text>
          <View className="flex-row items-baseline gap-1">
            <Text variant="numeric" className="text-[26px] leading-[32px] text-pandan-ink">
              {line.kcal.toLocaleString()}
            </Text>
            <Text variant="caption">{t('common:unit.kcal')}</Text>
          </View>
        </View>
      </Card>

      <Button
        fullWidth
        disabled={!usable}
        onPress={() =>
          onSubmit({
            name: food.name,
            foodId: food.id,
            amount: storedAmount(stored),
            unit: choice.unit,
            displayUnit: displayUnitFor(choice.key),
            perUnit: choice.perUnit,
          })
        }
      >
        {action}
      </Button>
    </>
  )
}

/** The chosen dish: its name, a way back to the results, and the amount form. */
function AmountPanel({
  foodId,
  onBack,
  onAdd,
  replacing,
}: {
  foodId: string
  onBack: () => void
  onAdd: (ingredient: RecipeIngredientInput) => void
  replacing: boolean
}) {
  const { t } = useTranslation(['recipes', 'logging', 'common'])
  const colors = useThemeColors()
  const { data: food } = useFood(foodId)

  if (!food) return null

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <IconButton size="sm" accessibilityLabel={t('common:action.back')} onPress={onBack}>
          {/* Tinted, like every chevron in this app's chrome: the illustration
              carries its own colour and reads as a stray accent beside a title. */}
          <Icon set="ui" name="chevron-left" size={20} tintColor={colors.muted} />
        </IconButton>
        <Text variant="subtitle" className="flex-1" numberOfLines={1}>
          {food.name}
        </Text>
      </View>

      <AmountForm
        food={food}
        action={t(replacing ? 'logging:detail.replacePart' : 'recipes:ingredient.add')}
        onSubmit={onAdd}
      />
    </View>
  )
}

const ZERO: Macros = { kcal: 0, carbs: 0, protein: 0, fat: 0 }

/**
 * The cook's own ingredient: a name, calories per some amount, and macros if
 * they know them.
 *
 * There is no "keep it for next time" here, which the design sketched. Saving
 * an ingredient into the catalogue would be a client writing `foods`, and no
 * client writes the catalogue — that is what keeps one person's kitchen out of
 * everybody else's search. A custom ingredient belongs to the recipe it was
 * typed into, and travels with it when the recipe is copied.
 */
function CustomPanel({
  onBack,
  onAdd,
  replacing,
}: {
  onBack: () => void
  onAdd: (ingredient: RecipeIngredientInput) => void
  replacing: boolean
}) {
  const { t } = useTranslation(['recipes', 'logging', 'common'])
  const colors = useThemeColors()
  const [name, setName] = useState('')
  const units = useSettings().data?.units
  const [amount, setAmount] = useState('100')
  const [unit, setUnit] = useState<IngredientKey>('g')
  const [choosing, setChoosing] = useState(false)
  const unitName = useUnitName()
  const [kcal, setKcal] = useState('')
  const [carbs, setCarbs] = useState('')
  const [protein, setProtein] = useState('')
  const [fat, setFat] = useState('')

  // Rounded as the column will round it, so the figures below are divided by
  // the amount that is actually stored: 50 kcal over 0.006 g divided by 0.006
  // and stored against 0.01 would come back as 83 kcal. In the stored unit: two
  // tablespoons are 29.57 ml, and the figures typed for them are per millilitre.
  const amountValue = storedAmount(storedFrom(typedNumber(amount), unit))

  // The figures are typed for the amount beside them — "642 kcal per 100 g" —
  // and stored per unit, because that is what stays true when the amount is
  // corrected later. One division, here, where the two numbers are both on
  // screen.
  const perUnit = (total: string): number =>
    amountValue > 0 ? Math.round((typedNumber(total || '0') / amountValue) * 10000) / 10000 : 0
  const figures = {
    kcal: perUnit(kcal),
    carbs: perUnit(carbs),
    protein: perUnit(protein),
    fat: perUnit(fat),
  }

  const ready =
    name.trim().length > 0 &&
    isStorableAmount(amountValue) &&
    Object.values(figures).every(isStorablePerUnit)

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <IconButton size="sm" accessibilityLabel={t('common:action.back')} onPress={onBack}>
          {/* Tinted, like every chevron in this app's chrome: the illustration
              carries its own colour and reads as a stray accent beside a title. */}
          <Icon set="ui" name="chevron-left" size={20} tintColor={colors.muted} />
        </IconButton>
        <Text variant="subtitle" className="flex-1" numberOfLines={1}>
          {t('recipes:ingredient.ownTitle')}
        </Text>
      </View>

      <TextField
        label={t('recipes:ingredient.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('recipes:ingredient.namePlaceholder')}
        maxLength={120}
        autoFocus
      />

      {/* The unit rides on the amount it measures, and opens the picker under
          it. Picking one does not convert the amount, unlike the catalogue
          picker: nothing here knows this food's density, and the figures below
          are typed for whatever the amount is. */}
      <TextField
        label={t('recipes:ingredient.amount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        selectTextOnFocus
        inputClassName={AMOUNT_TYPE}
        rightSlot={
          <UnitPill
            label={unitName(unit, typedNumber(amount) || 2)}
            open={choosing}
            onPress={() => toggleChoosing(setChoosing)}
            accessibilityLabel={t('recipes:ingredient.unitTitle')}
          />
        }
      />

      {choosing ? (
        <UnitGroups
          keys={[...unitsFor(units, 'recipe'), 'piece']}
          value={unit}
          onChange={(next) => {
            setUnit(next)
            setChoosing(false)
          }}
        />
      ) : null}

      <TextField
        label={t('recipes:ingredient.calories')}
        value={kcal}
        onChangeText={setKcal}
        keyboardType="number-pad"
        placeholder="0"
        rightSlot={
          <Text variant="label" className="text-muted">
            {t('common:unit.kcal')}
          </Text>
        }
      />

      <View className="flex-row gap-2.5">
        <TextField
          containerClassName="flex-1"
          label={t('common:macro.carbs')}
          value={carbs}
          onChangeText={setCarbs}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        <TextField
          containerClassName="flex-1"
          label={t('common:macro.protein')}
          value={protein}
          onChangeText={setProtein}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        <TextField
          containerClassName="flex-1"
          label={t('common:macro.fat')}
          value={fat}
          onChangeText={setFat}
          keyboardType="decimal-pad"
          placeholder="0"
        />
      </View>

      {/* In the body, after the field, rather than in the sheet's footer: at
          full height a footer lands behind the keyboard. */}
      <Button
        fullWidth
        disabled={!ready}
        onPress={() =>
          onAdd({
            name: name.trim(),
            amount: amountValue,
            unit: storedUnit(unit),
            displayUnit: displayUnitFor(unit),
            perUnit: { ...ZERO, ...figures },
          })
        }
      >
        {t(replacing ? 'logging:detail.replacePart' : 'recipes:ingredient.add')}
      </Button>
    </View>
  )
}
