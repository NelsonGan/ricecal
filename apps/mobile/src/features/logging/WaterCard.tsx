import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput, View } from 'react-native'

import { useAddWater } from '@/data'
import { DEFAULT_WATER_ML, millilitres, WATER_MAX_ML, WATER_PRESETS } from '@/lib/water'
import { radius, slab } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import {
  Card,
  Icon,
  IconButton,
  Sheet,
  Squish,
  Text,
  useNumpadField,
  useToast,
  WaterTank,
} from '@/ui'
import { TANK_HEIGHT, TankFigure } from './TankFigure'

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
 * THE FIGURE IS DRAWN TWICE, once on the dry ground and once in the water:
 * `WaterTank` does the clipping and `TankFigure` picks the two inks, which is
 * the half worth reading — in the dark palette the water and the water ink are
 * the same value, so one copy would vanish exactly as the day went well.
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
  const toast = useToast()
  const addWater = useAddWater(date)

  const [sheetOpen, setSheetOpen] = useState(false)

  /**
   * One path for both directions, because the server has one: a removal is an
   * addition of a negative amount, and so is the undo of either.
   *
   * The toast has to know which happened, though. Read from the same figure,
   * "600 ml of water" would announce a removal as a drink — and would print the
   * minus sign into the sentence if it were not.
   */
  const record = (amount: number) => {
    addWater.mutate(amount)
    setSheetOpen(false)
    toast.show({
      title:
        amount < 0
          ? t('logging:water.removed', { amount: millilitres(-amount) })
          : t('logging:water.added', { amount: millilitres(amount) }),
      tone: 'success',
      icon: { set: 'body', name: 'water-drop' },
      action: { label: t('logging:water.undo'), onPress: () => addWater.mutate(-amount) },
    })
  }

  // Only the sheet needs this now: the figure on the tank prints the pair
  // itself, and how far off the goal is belongs with the buttons that close it.
  const toGo = Math.max(0, goalMl - ml)

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
            <View className="flex-1 items-end pr-1 pt-1">
              <View className="flex-row items-center gap-1.5">
                <TankFigure ml={ml} goalMl={goalMl} onWater={onWater} />

                {/* Beside the figure, not opposite it: the two are one control
                    and one readout about the same thing, and a button parked at
                    the far end of a 300pt band reads as belonging to the card
                    rather than to the number.

                    GHOST, which is the design system's own quietest icon
                    control: no slab, no fill, just the glyph over the water. It
                    was a filled circle, and a solid disc with a raised edge
                    standing on a surface that is itself the content read as a
                    sticker stuck on the card — the loudest thing on a screen
                    whose loudest thing should be the food. The 44pt box is
                    transparent, so what shrank is what you can see and not what
                    you can hit. */}
                <IconButton
                  variant="ghost"
                  size="sm"
                  onPress={() => setSheetOpen(true)}
                  accessibilityLabel={t('logging:water.addTitle')}
                >
                  <Icon set="ui" name="plus" size={20} />
                </IconButton>
              </View>
            </View>
          )}
        </WaterTank>
      </Card>

      <AddWaterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onRecord={record}
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
 * CAPPED RATHER THAN FULL HEIGHT, and this is the one exception to the rule in
 * CLAUDE.md that a sheet with a text field in it is always `fullHeight`. That
 * rule is about the SYSTEM keyboard: `KeyboardAvoidingView` pads a capped panel
 * up off the bottom edge when one opens, and the strip it leaves shows the
 * scrim through the curve of the keyboard's corners. This field is on the app's
 * own pad, which suppresses the system keyboard entirely — so no keyboard event
 * ever reaches that view, and `Sheet` already grows a capped panel by
 * `numpad.height` instead. Four rows of content in a full-height sheet was most
 * of a screen of empty surface under them.
 *
 * `scrollable={false}` for the reason short content always is: a scroll view
 * scrolls itself to reveal the first responder and overshoots on the first
 * open, before the pad's real height is known.
 */
function AddWaterSheet({
  visible,
  onClose,
  onRecord,
  toGo,
}: {
  visible: boolean
  onClose: () => void
  /** Positive adds, negative takes back. */
  onRecord: (ml: number) => void
  toGo: number
}) {
  const { t } = useTranslation(['logging', 'common'])

  return (
    <Sheet visible={visible} onClose={onClose} scrollable={false}>
      {/* The heading is content rather than the `title` prop, so what is left of
          the goal can sit on the same line, right aligned. `app/log/index.tsx`
          does exactly this with "1,460 kcal left", and the two sheets are the
          same kind of thing opened by the same kind of button — matching them
          is cheaper for a reader than two arrangements of one idea. */}
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="subtitle" className="flex-1" numberOfLines={1}>
          {t('logging:water.addTitle')}
        </Text>
        <Text variant="caption">{t('logging:water.left', { amount: millilitres(toGo) })}</Text>
      </View>

      <View className="flex-row gap-2">
        {WATER_PRESETS.map((preset) => (
          <Squish
            key={preset.id}
            depth={slab.md}
            radius={radius.md}
            containerClassName="flex-1"
            slabClassName="bg-water-slab"
            className="items-center gap-1 rounded-[20px] bg-water px-2 py-4"
            onPress={() => onRecord(preset.ml)}
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
      <CustomAmount key={visible ? 'open' : 'shut'} onRecord={onRecord} />
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
function CustomAmount({ onRecord }: { onRecord: (ml: number) => void }) {
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
    // NO `label`, so the pad's header is the Done key and nothing else. It
    // named the field for the case the pad covers it, and this sheet is short
    // enough that it never does — the field is two rows above the keys. The
    // words are still on the field's own `accessibilityLabel`, which is where
    // anybody who cannot see that layout was reading them from anyway.
    returnKeyType: 'done',
  })

  return (
    <>
      {/* No heading over it. "ANOTHER AMOUNT" said what the three buttons above
          have just finished implying, and an overline is a section marker in a
          sheet that has only ever had one section. The field's own
          `accessibilityLabel` carries the words for anybody who cannot see the
          layout say it. */}
      <View className="mt-md flex-row items-end justify-center gap-3">
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

      {/* BOTH DIRECTIONS, and the minus is not a nicety: the toast's undo is
          gone the moment it times out, a drink logged on the wrong day is only
          discovered later, and a bottle nobody finished is an ordinary Tuesday.
          Without this the only way back was to log a negative amount, which
          this pad cannot type.

          The same pair `Stepper` draws, tinted the same way and for the same
          reason — the illustrations carry their own palette, which on a neutral
          button reads as a stray colour rather than as a control. Centred,
          because they are two halves of one decision about the figure above
          them rather than the sheet's action row. */}
      <View className="flex-row items-center justify-center gap-4">
        <IconButton
          variant="subtle"
          disabled={!valid}
          onPress={() => onRecord(-parsed)}
          accessibilityLabel={t('logging:water.customRemove')}
        >
          <Icon set="ui" name="minus" size={26} tintColor={colors.muted} />
        </IconButton>
        <IconButton
          variant="subtle"
          disabled={!valid}
          onPress={() => onRecord(parsed)}
          accessibilityLabel={t('logging:water.customAdd')}
        >
          <Icon set="ui" name="plus" size={26} tintColor={colors.muted} />
        </IconButton>
      </View>
    </>
  )
}
