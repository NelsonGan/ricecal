import { type Ref, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput, useWindowDimensions, View } from 'react-native'

import { useAddWater } from '@/data'
import { SplitFigure } from '@/features/shared/SplitFigure'
import { DEFAULT_WATER_ML, millilitres, WATER_MAX_ML, WATER_PRESETS } from '@/lib/water'
import { radius, slab } from '@/theme/tokens'
import { useTheme, useThemeColors } from '@/theme/useTheme'
import {
  Card,
  cn,
  Icon,
  IconButton,
  Sheet,
  Squish,
  Text,
  useNumpadField,
  useToast,
  WaterTank,
} from '@/ui'

/**
 * The least the card is drawn at, before it has been measured and on a row that
 * gives it no more: room for the heading and the two lines of the figure at the
 * default text size. It grows with the text, or with large text the figure runs
 * into the heading.
 */
const MIN_CARD_HEIGHT = 124

export type WaterCardProps = {
  /** The day the strip has selected. Drinks are recorded against it, not against now. */
  date: string
  /** Millilitres so far. */
  ml: number
  /** The day's goal. Falls back to the same figure the column defaults to. */
  goalMl?: number
  /** The day has not answered yet. The tank holds its size and waits. */
  loading?: boolean
  /** Layout, for a caller that has to clear something below it. */
  className?: string
  /** The screen is out of sight, so the tank holds still. */
  paused?: boolean
}

/**
 * Water on Today: the card is the tank. It fills edge to edge, with the heading
 * and its Add button across the top and the day's amount at the foot, both
 * drawn on the water rather than in a box above it.
 *
 * It was a wide band across the screen with the figure and the button in its
 * corner and no heading. Beside the ring it is a tile among tiles, and the
 * heading is what makes it one: each tile in that column says what it is in
 * the same place. For a round it was a heading over a tank inset in the card,
 * which read as a chart in a box rather than a card filling up.
 *
 * The figure is drawn twice, on the dry ground and in the water: in the dark
 * palette the water and the water ink are the same value, so one copy would
 * vanish exactly as the day went well.
 *
 * The undo is a toast, because a button that appears after every drink is a
 * control that exists to be ignored.
 *
 * Everything here is in millilitres rather than the litres the trends show,
 * because this is where a figure is chosen. See `lib/water.ts`.
 */
export function WaterCard({
  date,
  ml,
  goalMl = DEFAULT_WATER_ML,
  loading = false,
  paused = false,
  className,
}: WaterCardProps) {
  const { t } = useTranslation(['logging', 'common', 'progress'])
  const { isDark } = useTheme()
  const toast = useToast()
  const addWater = useAddWater(date)

  const [sheetOpen, setSheetOpen] = useState(false)
  const { fontScale } = useWindowDimensions()
  const minCard = Math.round(MIN_CARD_HEIGHT * Math.min(1.6, Math.max(1, fontScale)))
  const [tankHeight, setTankHeight] = useState(minCard)

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
          silhouettes coincide, so what the user sees is one object filling up.
          Today pairs this with the activity card in the column beside the
          ring, and the two together stand as tall as the ring card, so the
          tank's height is measured rather than fixed. */}
      <Card flush className={className} contentClassName="flex-1 gap-0">
        <View
          className="flex-1"
          style={{ minHeight: minCard }}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.height)
            if (next > 0 && next !== tankHeight) setTankHeight(next)
          }}
        >
          {/* ABSOLUTE, so the tank cannot size the box it is measured from. In
              the flow, a tank drawn at the measured height made that box at
              least as tall, so it could only ever grow: switching to a day
              with a taller ring card left the tank at the taller size, and the
              activity card under it was squeezed to nothing. */}
          <View className="absolute inset-0">
            <WaterTank
              value={ml}
              goal={goalMl}
              loading={loading}
              paused={paused}
              height={tankHeight}
              radius={radius.card}
              accessibilityLabel={t('logging:water.level', {
                filled: millilitres(ml),
                goal: millilitres(goalMl),
              })}
            >
              {(onWater) => (
                <View className="flex-1 justify-between pb-3">
                  <View className="flex-row items-center gap-1.5 pt-1.5 pr-1.5 pl-4">
                    <Icon set="body" name="water-drop" size={18} />
                    <Text
                      variant="label"
                      className={cn('shrink', inkOf(onWater, isDark, 'text-ink'))}
                      numberOfLines={1}
                    >
                      {t('progress:metric.water')}
                    </Text>
                    {/* GHOST, the design system's quietest icon control: no
                        slab and no fill, just the glyph over the water. A
                        filled disc on a surface that is itself the content read
                        as a sticker stuck on the card. The 44pt box is still
                        there to hit. Only the dry copy can be pressed; the wet
                        one is a picture of it. */}
                    <IconButton
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onPress={() => setSheetOpen(true)}
                      accessibilityLabel={t('logging:water.addTitle')}
                    >
                      <Icon set="ui" name="plus" size={20} />
                    </IconButton>
                  </View>
                  {/* The figure at the FOOT of the tank, where the water is on
                      any day somebody has drunk anything, so it reads as the
                      level's own number. */}
                  <TankAmount ml={ml} goalMl={goalMl} onWater={onWater} />
                </View>
              )}
            </WaterTank>
          </View>
        </View>
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
 * The colour of anything written on the tank. `WaterTank` draws its overlay
 * twice, once on the dry ground and once in the water, and says which. In the
 * water the light palette wants `ink`, not `on-water`:
 * `on-water` is white, the design system's pairing for a label on a water
 * chip, and a figure in white on `#4CC9F0` is about 1.9:1, washing out on
 * exactly the days somebody most wants to read it. Dark ink on that blue is
 * 8:1. The dark palette is the other way round: `on-water` is already
 * near-black there, against a brighter water, and `ink` is the near-white that
 * fails.
 */
function inkOf(onWater: boolean, isDark: boolean, dry: string) {
  return onWater ? (isDark ? 'text-on-water' : 'text-ink') : dry
}

/** The day's water on Today's tank: the amount large, the goal small under it. */
function TankAmount({ ml, goalMl, onWater }: { ml: number; goalMl: number; onWater: boolean }) {
  const { t } = useTranslation(['logging', 'common'])
  const { isDark } = useTheme()
  const ink = inkOf(onWater, isDark, 'text-water-ink')
  const figure = millilitres(ml)

  // Hidden from a screen reader: the tank announces the same pair as a sentence.
  return (
    <View
      className="px-4"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <SplitFigure
        text={t('common:volume.ml', { value: figure })}
        figure={figure}
        size="md"
        className={ink}
      />
      <Text variant="caption" className={ink} numberOfLines={1}>
        {t('logging:water.ofGoal', { goal: millilitres(goalMl) })}
      </Text>
    </View>
  )
}

/**
 * The panel behind Add: the three vessels, and anything they miss. The presets
 * are the sizes people drink from rather than a round arithmetic series, and each
 * carries its own drawing, which makes the row scannable without reading.
 *
 * Capped rather than full height, the one exception to the README rule that a
 * sheet with a text field is always `fullHeight`. That rule is about the system
 * keyboard, and this field is on the app's own pad, so no keyboard event reaches
 * the view and `Sheet` grows a capped panel by `numpad.height` instead. Four rows
 * in a full-height sheet was most of a screen of empty surface.
 *
 * `scrollable={false}` for the reason short content always is: a scroll view
 * overshoots revealing the first responder before the pad's height is known.
 *
 * The field is focused the moment the panel is presented, so a volume the presets
 * miss is a number away rather than a tap and then a number. `onShow` rather than
 * `autoFocus`, because a field inside a `Modal` mounts before the platform has
 * presented the window and the focus is dropped.
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
  const amount = useRef<CustomAmountHandle>(null)

  return (
    <Sheet
      closeLabel={t('common:action.close')}
      visible={visible}
      onClose={onClose}
      scrollable={false}
      onShow={() => amount.current?.focus()}
    >
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
      <CustomAmount ref={amount} key={visible ? 'open' : 'shut'} onRecord={onRecord} />
    </Sheet>
  )
}

/** The one verb the sheet needs off the field. See `CustomAmount`. */
type CustomAmountHandle = { focus: () => void }

/**
 * A volume none of the presets covers.
 *
 * ITS OWN COMPONENT, and that is load-bearing rather than tidy. `useNumpadField`
 * reads the nearest `NumpadHost` through context, and a hook called in the
 * component that RETURNS a `<Sheet
  closeLabel={t('common:action.close')}>` runs outside that sheet's subtree — so it
 * finds the host in `Screen` instead, and the pad opens on the screen, behind
 * the sheet's native window. The field is focused, the system keyboard is
 * suppressed, and nothing appears to type with.
 *
 * Which is also why the sheet reaches IN here to focus it rather than the field
 * reaching out: the input's ref belongs to `useNumpadField`, which owns it and
 * spreads it on last, so the only thing worth handing back up is the one verb
 * the sheet needs.
 */
function CustomAmount({
  ref,
  onRecord,
}: {
  ref?: Ref<CustomAmountHandle>
  onRecord: (ml: number) => void
}) {
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

  // `numpad.ref` is the hook's own `useRef` and never changes identity, so this
  // handle is written once and the sheet's `onShow` always finds a live input.
  useImperativeHandle(ref, () => ({ focus: () => numpad.ref.current?.focus() }), [numpad.ref])

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
