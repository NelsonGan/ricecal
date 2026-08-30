import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Macros, RecipeIngredientInput, RecipeUnit } from '@/data'
import { useFood, useFoodSearch } from '@/data'
import { ItemRow } from '@/features/shared'
import { useDebouncedValue } from '@/lib/use-debounce'
import { useThemeColors } from '@/theme/useTheme'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  SearchField,
  Sheet,
  Tappable,
  Text,
  TextField,
} from '@/ui'
import { ingredientBasis, ingredientTotal } from './basis'

export type IngredientSheetProps = {
  visible: boolean
  onClose: () => void
  /** The finished line, ready to be staged on the form. */
  onAdd: (ingredient: RecipeIngredientInput) => void
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

const UNITS: RecipeUnit[] = ['g', 'ml', 'piece']

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
export function IngredientSheet({ visible, onClose, onAdd }: IngredientSheetProps) {
  const { t } = useTranslation(['recipes', 'common'])
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
      title={t('recipes:ingredient.title')}
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
        <AmountPanel foodId={pickedId} onBack={back} onAdd={add} />
      ) : null}

      {panel === 'own' ? <CustomPanel onBack={back} onAdd={add} /> : null}
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
 * How much of something went in, and what that much costs. Shared by adding an
 * ingredient and correcting one later, and short because per-unit storage does
 * the work: `perUnit` is what one gram, millilitre or piece is worth, so a new
 * amount reprices with a multiplication and no lookup.
 *
 * The unit is not editable here, from the same reasoning: `perUnit` was derived
 * against a unit, so re-reading 250 g of santan as 250 pieces would keep a number
 * that means nothing. Changing the unit is removing the row and adding it again.
 */
function AmountForm({
  unit,
  perUnit,
  initial,
  action,
  onSubmit,
}: {
  unit: RecipeUnit
  perUnit: Macros
  /** Prefilled, so the figure on screen is the one they just tapped. */
  initial: number
  action: string
  onSubmit: (amount: number) => void
}) {
  const { t } = useTranslation(['recipes', 'common'])
  // Null until they touch it, so the field shows the prefill without that
  // prefill becoming a string the moment the component mounts.
  const [amount, setAmount] = useState<string | null>(null)

  const value = amount === null ? initial : Number(amount)
  const usable = Number.isFinite(value) && value > 0
  const line = ingredientTotal(perUnit, usable ? value : 0)

  return (
    <>
      <TextField
        label={t('recipes:ingredient.amount')}
        value={amount === null ? String(initial) : amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        selectTextOnFocus
        rightSlot={
          <Text variant="label" className="text-muted">
            {t(`recipes:ingredient.unit.${unit}`, { count: value })}
          </Text>
        }
      />

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

      <Button fullWidth disabled={!usable} onPress={() => onSubmit(value)}>
        {action}
      </Button>
    </>
  )
}

/**
 * How much of the chosen dish went in.
 *
 * The amount is prefilled with the serving the catalogue quoted — see
 * `ingredientBasis` — so the calorie figure on the row the user just tapped is
 * the calorie figure they see here before changing anything. A picker that
 * opened at zero would make them do the arithmetic twice.
 */
function AmountPanel({
  foodId,
  onBack,
  onAdd,
}: {
  foodId: string
  onBack: () => void
  onAdd: (ingredient: RecipeIngredientInput) => void
}) {
  const { t } = useTranslation(['recipes', 'common'])
  const colors = useThemeColors()
  const { data: food } = useFood(foodId)
  const basis = food ? ingredientBasis(food) : null

  if (!food || !basis) return null

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
        unit={basis.unit}
        perUnit={basis.perUnit}
        initial={basis.amount}
        action={t('recipes:ingredient.add')}
        onSubmit={(amount) =>
          onAdd({
            name: food.name,
            foodId: food.id,
            amount,
            unit: basis.unit,
            perUnit: basis.perUnit,
          })
        }
      />
    </View>
  )
}

export type IngredientAmountSheetProps = {
  /** The row being corrected, or null when the sheet is closed. */
  ingredient: RecipeIngredientInput | null
  onClose: () => void
  onSave: (ingredient: RecipeIngredientInput) => void
}

/**
 * Correcting how much of something went in, after the fact.
 *
 * The gap this fills is the autofill. A described pot comes back with amounts
 * the model estimated — 400 g of noodles, 3 eggs — and until this existed the
 * only way to say "it was 250" was to delete the row and search the catalogue
 * for it again, which for an ingredient the model invented (a described recipe
 * never touches the catalogue) meant retyping its calories by hand. The amount
 * is the one number on those rows most likely to be wrong and it was the one
 * that could not be changed.
 *
 * Only the amount, and `AmountForm` says why. A wrong FOOD is a different
 * correction and the row already has a cross for it.
 */
export function IngredientAmountSheet({ ingredient, onClose, onSave }: IngredientAmountSheetProps) {
  const { t } = useTranslation(['recipes', 'common'])

  return (
    <Sheet
      visible={ingredient !== null}
      onClose={onClose}
      title={ingredient?.name ?? ''}
      closeLabel={t('common:action.close')}
      // A text field, so full height. And short content, so not scrollable:
      // a scroll view scrolls itself to reveal the first responder and, before
      // the keyboard's real height is known, carries the field off the top.
      // Both rules are in README.md.
      fullHeight
      scrollable={false}
    >
      {/* Keyed by name, so opening the sheet on a different row remounts the
          form and re-reads its prefill. Without it `AmountForm` keeps the
          amount typed into the row before this one. */}
      {ingredient ? (
        <View key={ingredient.name} className="gap-3">
          <AmountForm
            unit={ingredient.unit}
            perUnit={ingredient.perUnit}
            initial={ingredient.amount}
            action={t('common:action.save')}
            onSubmit={(amount) => {
              onSave({ ...ingredient, amount })
              onClose()
            }}
          />
        </View>
      ) : null}
    </Sheet>
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
}: {
  onBack: () => void
  onAdd: (ingredient: RecipeIngredientInput) => void
}) {
  const { t } = useTranslation(['recipes', 'common'])
  const colors = useThemeColors()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('100')
  const [unit, setUnit] = useState<RecipeUnit>('g')
  const [kcal, setKcal] = useState('')
  const [carbs, setCarbs] = useState('')
  const [protein, setProtein] = useState('')
  const [fat, setFat] = useState('')

  const amountValue = Number(amount)
  const kcalValue = Number(kcal)
  const ready = name.trim().length > 0 && amountValue > 0 && Number.isFinite(kcalValue)

  // The figures are typed for the amount beside them — "642 kcal per 100 g" —
  // and stored per unit, because that is what stays true when the amount is
  // corrected later. One division, here, where the two numbers are both on
  // screen.
  const perUnit = (total: string): number =>
    amountValue > 0 ? Math.round((Number(total || 0) / amountValue) * 10000) / 10000 : 0

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

      <Text variant="body" className="text-muted">
        {t('recipes:ingredient.customBody')}
      </Text>

      <TextField
        label={t('recipes:ingredient.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('recipes:ingredient.namePlaceholder')}
        autoFocus
      />

      <TextField
        label={t('recipes:ingredient.amount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        selectTextOnFocus
      />

      {/* The unit gets a row of its own rather than sharing one with the amount.
          Beside the field the three chips had half a screen between them, and
          "pieces" wrapped one letter per line. */}
      <View className="flex-row gap-2">
        {UNITS.map((value) => (
          <Chip
            key={value}
            className="flex-1"
            selected={unit === value}
            onPress={() => setUnit(value)}
          >
            {t(`recipes:ingredient.unit.${value}`, { count: 2 })}
          </Chip>
        ))}
      </View>

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

      <Text variant="overline">{t('recipes:ingredient.macros')}</Text>
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
            unit,
            perUnit: {
              ...ZERO,
              kcal: perUnit(kcal),
              carbs: perUnit(carbs),
              protein: perUnit(protein),
              fat: perUnit(fat),
            },
          })
        }
      >
        {t('recipes:ingredient.add')}
      </Button>
    </View>
  )
}
