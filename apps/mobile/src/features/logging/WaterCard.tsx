import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput, View } from 'react-native'

import { useAddWater } from '@/data'
import { DEFAULT_WATER_ML, millilitres, WATER_MAX_ML, WATER_PRESETS } from '@/lib/water'
import { radius, slab } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Card, Icon, Sheet, Squish, Text, useNumpadField, useToast, WaterTank } from '@/ui'

export type WaterCardProps = {
  /** The day the strip has selected. Drinks are recorded against it, not against now. */
  date: string
  /** Millilitres so far. */
  ml: number
  /** The day's goal. Falls back to the same figure the column defaults to. */
  goalMl?: number
  /** The day has not answered yet. The tank holds its size and waits. */
  loading?: boolean
}

/**
 * Water on Today: a band of it, and one button.
 *
 * TWO LINES, and that is the design. The first attempt at this put a tall glass
 * beside a column of three quick-add buttons and a fourth for a custom amount,
 * which is a good control panel and a bad card: it took a third of the screen
 * on a diary whose subject is the meals underneath, and it was the largest
 * thing on Today while being the smallest decision on it. What is here now is a
 * level you can read at a glance and an Add that opens the panel — the choosing
 * happens in a sheet, where a row of buttons costs nothing.
 *
 * THE UNDO IS A TOAST, for the same reason. A button that appears on the card
 * after every drink is a control that exists to be ignored; a toast offers it
 * for as long as anybody would want it and takes no space at all.
 *
 * Everything here is in MILLILITRES rather than the litres the trends show,
 * because this is where a figure is chosen. See `lib/water.ts`.
 */
export function WaterCard({
  date,
  ml,
  goalMl = DEFAULT_WATER_ML,
  loading = false,
}: WaterCardProps) {
  const { t } = useTranslation(['logging', 'common'])
  const toast = useToast()
  const addWater = useAddWater(date)

  const [sheetOpen, setSheetOpen] = useState(false)

  const add = (amount: number) => {
    addWater.mutate(amount)
    setSheetOpen(false)
    toast.show({
      title: t('logging:water.added', { amount: millilitres(amount) }),
      tone: 'success',
      icon: { set: 'body', name: 'water-drop' },
      // `mutate` again rather than anything clever: the day's total is the
      // server's, so taking a drink back is just adding a negative one.
      action: { label: t('logging:water.undo'), onPress: () => addWater.mutate(-amount) },
    })
  }

  const toGo = Math.max(0, goalMl - ml)

  return (
    <>
      <Card
        tone="water"
        title={t('logging:water.title')}
        action={
          loading ? undefined : (
            <Text variant="label" className={toGo === 0 ? 'text-pandan-ink' : 'text-water-ink'}>
              {t('logging:water.count', { filled: millilitres(ml), goal: millilitres(goalMl) })}
            </Text>
          )
        }
      >
        <View className="flex-row items-center gap-3">
          <WaterTank
            className="min-w-0 flex-1"
            value={ml}
            goal={goalMl}
            loading={loading}
            accessibilityLabel={t('logging:water.level', {
              filled: millilitres(ml),
              goal: millilitres(goalMl),
            })}
          />

          {/* Square, and 56 because that is `WaterTank`'s own height: the two
              are a pair, so the row reads as one object rather than as a chart
              with a button parked next to it. */}
          <Squish
            depth={slab.md}
            radius={radius.sm}
            slabClassName="bg-water-slab"
            className="h-[56px] w-[56px] items-center justify-center rounded-[14px] bg-water"
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('logging:water.addTitle')}
          >
            <Icon set="ui" name="plus" size={24} />
          </Squish>
        </View>
      </Card>

      <AddWaterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onAdd={add}
        toGo={toGo}
      />
    </>
  )
}

/**
 * The panel behind Add: the three vessels, and anything they miss.
 *
 * The presets are the sizes people drink from rather than a round arithmetic
 * series, and each carries its own drawing — the picture is what makes the row
 * scannable without reading, and the figure is what makes it honest. A button
 * labelled "Glass" alone is the unit this whole change removed.
 *
 * `fullHeight` and `scrollable={false}`, which is the shape every short sheet
 * with a field in it has here: a capped panel is padded up off the bottom edge
 * when the pad opens and shows the scrim through the corner of it, and a
 * scrollable one scrolls the field off the top on the first focus, before the
 * pad's real height is known. The button is in the body for the same reason —
 * a footer at full height lands behind the pad.
 */
function AddWaterSheet({
  visible,
  onClose,
  onAdd,
  toGo,
}: {
  visible: boolean
  onClose: () => void
  onAdd: (ml: number) => void
  toGo: number
}) {
  const { t } = useTranslation(['logging', 'common'])

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('logging:water.addTitle')}
      description={
        toGo === 0
          ? t('logging:water.goalMet')
          : t('logging:water.toGo', { amount: millilitres(toGo) })
      }
      fullHeight
      scrollable={false}
    >
      <View className="flex-row gap-2">
        {WATER_PRESETS.map((preset) => (
          <Squish
            key={preset.id}
            depth={slab.md}
            radius={radius.md}
            containerClassName="flex-1"
            slabClassName="bg-water-slab"
            className="items-center gap-1 rounded-[20px] bg-water px-2 py-4"
            onPress={() => onAdd(preset.ml)}
            accessibilityRole="button"
            accessibilityLabel={t('logging:water.add', { amount: millilitres(preset.ml) })}
          >
            <Icon set="food" name={preset.icon} size={30} />
            <Text variant="label" className="text-water-ink" numberOfLines={1}>
              {t('common:volume.ml', { value: millilitres(preset.ml) })}
            </Text>
          </Squish>
        ))}
      </View>

      {/* Remounted on every open, which is how the draft is forgotten. A `Sheet`
          is a `Modal` that stays in the tree with `visible={false}`, so a number
          typed and abandoned would otherwise still be there next time. */}
      <CustomAmount key={visible ? 'open' : 'shut'} onAdd={onAdd} />
    </Sheet>
  )
}

/**
 * A volume none of the presets covers.
 *
 * ITS OWN COMPONENT, and that is load-bearing rather than tidy. `useNumpadField`
 * reads the nearest `NumpadHost` through context, and a hook called in the
 * component that RETURNS a `<Sheet>` runs outside that sheet's subtree — so it
 * finds the host in `Screen` instead, and the pad opens on the screen, behind
 * the sheet's native window. The field is focused, the system keyboard is
 * suppressed, and nothing appears to type with.
 */
function CustomAmount({ onAdd }: { onAdd: (ml: number) => void }) {
  const { t } = useTranslation(['logging', 'common'])
  const colors = useThemeColors()
  const [typed, setTyped] = useState('')

  const parsed = Number(typed)
  const valid = Boolean(typed) && Number.isFinite(parsed) && parsed > 0 && parsed <= WATER_MAX_ML

  const numpad = useNumpadField({
    value: typed,
    onChangeText: setTyped,
    // Whole millilitres. Nothing anybody pours is measured to a tenth of one,
    // and the column cannot hold it.
    decimal: false,
    maxLength: 5,
    label: t('logging:water.customLabel'),
    returnKeyType: 'done',
  })

  return (
    <>
      <Text variant="overline" className="mt-md">
        {t('logging:water.customLabel')}
      </Text>

      <View className="flex-row items-end gap-3">
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder={t('logging:water.customPlaceholder')}
          placeholderTextColor={colors.faint}
          // Does nothing while the app's own pad is up, and is the fallback if a
          // platform ever declines to suppress the keyboard.
          keyboardType="number-pad"
          underlineColorAndroid="transparent"
          accessibilityLabel={t('logging:water.customLabel')}
          className="min-w-0 flex-1 border-line border-b-2 border-dashed pb-1 text-center font-display text-[36px] text-ink"
          style={{ paddingVertical: 0 }}
          cursorColor={colors.water}
          selectionColor={colors.water}
          {...numpad}
        />
        <Text variant="label" className="pb-2 text-muted">
          {t('common:volume.mlUnit')}
        </Text>
      </View>

      <Button onPress={() => onAdd(parsed)} disabled={!valid}>
        {t('logging:water.customAdd')}
      </Button>
    </>
  )
}
