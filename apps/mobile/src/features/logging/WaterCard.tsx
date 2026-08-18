import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput, View } from 'react-native'

import { useAddWater } from '@/data'
import { DEFAULT_WATER_ML, millilitres, WATER_MAX_ML, WATER_PRESETS } from '@/lib/water'
import { radius, slab } from '@/theme/tokens'
import { useTheme, useThemeColors } from '@/theme/useTheme'
import { Button, Card, Icon, Sheet, Squish, Text, useNumpadField, useToast, WaterTank } from '@/ui'

/**
 * How tall the tank is, which is how tall the card is.
 *
 * Enough to write a figure across without the water crowding it, and no more:
 * this is one line of information on a screen whose subject is underneath it.
 */
const TANK_HEIGHT = 88

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
 * Water on Today: the card IS the tank.
 *
 * ONE RECTANGLE, and everything else is drawn on it. It went through two
 * shapes before this: a tall glass beside a column of quick-add buttons, which
 * took a third of the screen on a diary whose subject is the meals underneath,
 * and then a band with the figure above it and an Add button beside it, which
 * was three boxes saying one thing. What is here is the level, with the figure
 * and the button tucked into the top-right corner of it. They are small because
 * water is the cheapest decision on this screen and should look like one.
 *
 * NO HEADING. The word "Water" over a tank of water is the label a picture
 * already carries; the drop beside the figure is what identifies it on the days
 * the tank is empty and there is no water to recognise.
 *
 * THE FIGURE IS DRAWN TWICE, once on the dry ground and once in the water, and
 * `WaterTank` explains why: in dark mode the water and the water ink are the
 * same colour, so a single copy would vanish exactly as the day went well.
 *
 * THE UNDO IS A TOAST. A button that appears on the card after every drink is a
 * control that exists to be ignored, and there is nowhere left to put one.
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
  const { isDark } = useTheme()
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
  const count = t('logging:water.count', { filled: millilitres(ml), goal: millilitres(goalMl) })

  /**
   * The figure's colour once the water is over it, and the one place in this
   * card that asks which theme it is in.
   *
   * `on-water` is the design system's pairing for a label on a water fill, and
   * it is white — which is right on a chip and wrong here, because a 22pt
   * figure in white on `#4CC9F0` is about 1.9:1 and washes out on exactly the
   * days somebody most wants to read it. Dark ink on that same blue is 8:1. The
   * dark palette has no such problem: `on-water` is already near-black there,
   * against a brighter water, and `ink` would be the near-white that fails.
   */
  const wetInk = isDark ? 'text-on-water' : 'text-ink'

  return (
    <>
      {/* `flush`, and the tank carries the card's own corner radius: the two
          silhouettes coincide, so what the user sees is one object filling up
          rather than a chart sitting in a box. */}
      <Card flush contentClassName="gap-0">
        <WaterTank
          value={ml}
          goal={goalMl}
          loading={loading}
          height={TANK_HEIGHT}
          radius={radius.card}
          accessibilityLabel={t('logging:water.level', {
            filled: millilitres(ml),
            goal: millilitres(goalMl),
          })}
        >
          {(onWater) => (
            /* Everything in the TOP-RIGHT corner, and nothing in the middle:
               the tank is the picture and this is its readout, so it sits out
               of the way and stays out of the water for most of a day. The row
               is short and close to the top for that reason — the band of
               levels that cuts through it is the last third of the goal, where
               the figure is fully under water and reads white on blue. */
            <View className="flex-1 items-end px-3 pt-2.5">
              <View className="flex-row items-center gap-1.5">
                <Icon set="body" name="water-drop" size={15} />
                {/* Hidden from a screen reader, both copies of it: the tank
                    itself announces the same pair of figures as a sentence, and
                    as a progress bar, which is the better of the two. */}
                <Text
                  variant="label"
                  numberOfLines={1}
                  className={onWater ? wetInk : 'text-water-ink'}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {loading ? '' : count}
                </Text>

                {/* Beside the figure, not opposite it: the two are one control
                    and one readout about the same thing, and a button parked at
                    the far end of a 300pt band reads as belonging to the card
                    rather than to the number.

                    Flat, because it is overlaid on the tank rather than raised
                    off the card — a squishy button standing proud of a surface
                    that is itself the content reads as a sticker. `water-slab`
                    is the one fill that holds against both grounds in both
                    themes: the ink is the water's own colour in the dark
                    palette and would disappear into it.

                    `hitSlop` takes a 28pt circle up to a 44pt target. The
                    button is small on purpose — this is the cheapest decision
                    on the screen and should look like one — but the finger
                    pressing it is the same size as everybody else's. */}
                <Squish
                  depth={0}
                  radius={radius.full}
                  containerClassName="ml-0.5"
                  className="h-7 w-7 items-center justify-center rounded-full bg-water-slab"
                  hitSlop={8}
                  onPress={() => setSheetOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('logging:water.addTitle')}
                >
                  <Icon set="ui" name="plus" size={13} />
                </Squish>
              </View>
            </View>
          )}
        </WaterTank>
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
            <Text variant="label" className="text-on-water" numberOfLines={1}>
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
