import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Cuisine, Focus, Meal } from '@/data'
import { useMealTimes, useUserId } from '@/data'
import { Button, Chip, Icon, IconButton, Sheet, Slider, Stepper, Text, TextField } from '@/ui'
import {
  cleanCuisine,
  defaultKcal,
  FOCUSES,
  KCAL_STEP,
  MAX_CUISINE_LENGTH,
  MAX_KCAL,
  MEALS,
  MIN_KCAL,
  mealAt,
} from './ask'
import { Dropdown } from './Dropdown'
import { MAX_CUISINES, readPreferences, saveCuisines, savePreferences } from './preferences'

export type AskAnswers = {
  meal: Meal
  focus: Focus
  cuisine: Cuisine
  /** Lean towards the lighter of two dishes that both fit. */
  healthy: boolean
  kcalLimit: number
}

export type AskSheetProps = {
  visible: boolean
  onClose: () => void
  onAsk: (answers: AskAnswers) => void
  /** What is left of today's budget, for the ceiling's starting value. */
  kcalLeft: number
  /** Shown under the slider, so the ceiling is read against the day. */
  showLeft: boolean
  busy?: boolean
}

/**
 * A section of the sheet: its label, the control under it, and — for the one
 * section that has one — a control on the label's own line.
 */
function Group({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <View className="gap-sm">
      <View className="min-h-[24px] flex-row items-center justify-between gap-md">
        <Text variant="overlineSm">{title}</Text>
        {action}
      </View>
      {children}
    </View>
  )
}

/**
 * L7 ASK MODAL: four questions, none of which has to be answered.
 *
 * EVERY CONTROL OPENS ON AN ANSWER, which is the opposite of the rule
 * onboarding's first screen follows and is right for the opposite reason. There
 * a prefilled body is a calorie budget worked out for somebody else; here a
 * prefilled sitting is a guess that costs nothing to be wrong about, because
 * the answer is a list of suggestions rather than a plan. Somebody who opens
 * this at seven in the evening and presses the button straight away should get
 * dinner.
 *
 * The sitting comes off the user's OWN meal times rather than off a table of
 * hours — see `mealAt` — and the ceiling off what is left of the day.
 *
 * THE THREE CHOICES ARE DROPDOWNS, and they were rows of chips. Chips put every
 * answer on screen at once, which is the better control while the options are a
 * fixed handful — and the cuisines stopped being one. A list the user edits is
 * a row that wraps to two lines, then three, so the sheet's height depended on
 * how much typing somebody had done and the calorie limit moved down the panel
 * every time they added a kitchen. Three fields of one height each say the same
 * thing in a form that does not move, and the two that could have stayed chips
 * follow the one that could not: three questions answered three different ways
 * would read as three different kinds of question.
 *
 * FULL HEIGHT, and now for two reasons. The form plus the ceiling comes to more
 * than the 440pt a capped body gets, and what a capped sheet does with the
 * overflow is hide the calorie limit behind the footer. And the cuisine editor
 * raises the KEYBOARD, which is the rule in CLAUDE.md about a sheet with typing
 * in it: capped, `KeyboardAvoidingView` pads the panel up off the bottom edge
 * and the scrim shows through the curve of the keyboard's corners.
 *
 * It KEEPS its footer, unlike the other full-height sheets in the app. Theirs is
 * dropped because a footer sits outside the scroll view and lands behind the
 * keyboard — which is a real cost here only while the editor is open, and the
 * editor has an Add button of its own inside the body. The button that sends the
 * question is the sheet's whole purpose and belongs where every other primary
 * action in the app is.
 */
export function AskSheet({
  visible,
  onClose,
  onAsk,
  kcalLeft,
  showLeft,
  busy = false,
}: AskSheetProps) {
  const { t } = useTranslation(['suggest', 'common'])
  const { data: mealTimes } = useMealTimes()
  const userId = useUserId()

  /**
   * The three answers that are about TASTE, seeded from what was sent last time.
   *
   * Read once, at mount, rather than on every opening: the state below is the
   * live answer from the moment the sheet is first drawn, and re-reading storage
   * over it would undo a choice made and not yet sent. See `preferences.ts` for
   * why the sitting and the ceiling are not among them.
   */
  const remembered = useRef(readPreferences(userId)).current

  const [meal, setMeal] = useState<Meal>('snack')
  const [focus, setFocus] = useState<Focus>(remembered.focus)
  const [cuisines, setCuisines] = useState<Cuisine[]>(remembered.cuisines)
  const [cuisine, setCuisine] = useState<Cuisine>(remembered.cuisine)
  const [healthy, setHealthy] = useState(remembered.healthy)
  const [kcalLimit, setKcalLimit] = useState(MIN_KCAL)
  /** Whether the cuisine list is being edited rather than chosen from. */
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  /**
   * Bumped on every opening, and used as the dropdowns' `key`.
   *
   * A `Sheet` is a `Modal` that stays in the tree with `visible={false}`, so a
   * `Dropdown` left expanded when the sheet was dismissed is still expanded the
   * next time it rises — the same trap the food detail screen's sheets fell into
   * with a saving flag. Whether a list is open is the one piece of state this
   * screen does not own, so remounting is the honest way to clear it: the values
   * all live up here and nothing is lost by it.
   */
  const [session, setSession] = useState(0)
  /**
   * Whether the ceiling is the user's number or the sheet's guess.
   *
   * The guess depends on the sitting — 300 for a snack, up to 800 for a meal —
   * so changing the sitting has to move it, or somebody who opens the sheet
   * mid-afternoon and taps Dinner is asked to find a dinner in 300 kcal. But
   * once they have set a figure themselves it is theirs, and a chip tap that
   * threw it away would be the sheet arguing with the person filling it in.
   */
  const [ownCeiling, setOwnCeiling] = useState(false)

  const chooseMeal = (next: Meal) => {
    setMeal(next)
    if (!ownCeiling) setKcalLimit(defaultKcal(kcalLeft, next))
  }

  const chooseKcal = (next: number) => {
    setOwnCeiling(true)
    setKcalLimit(next)
  }

  /**
   * A kitchen is added and the list is saved THERE, not when the question is
   * asked.
   *
   * The three answers around it are saved on Ask, because a chip tapped and
   * tapped back is not a preference. A cuisine somebody typed out is: dismissing
   * the sheet afterwards would lose work rather than lose a tap, and the list is
   * a thing they are curating rather than an answer they are giving.
   */
  const keepList = (next: Cuisine[]) => {
    setCuisines(next)
    saveCuisines(userId, next)
  }

  const addCuisine = () => {
    const clean = cleanCuisine(draft)
    if (!clean) return
    // Compared case-insensitively, because "malay" and "Malay" are one kitchen
    // and two rows in a dropdown. An existing one is SELECTED rather than
    // refused: somebody typing a name already on the list is asking for it.
    const existing = cuisines.find((known) => known.toLowerCase() === clean.toLowerCase())
    if (existing) {
      setCuisine(existing)
      setDraft('')
      return
    }
    if (cuisines.length >= MAX_CUISINES) return
    keepList([...cuisines, clean])
    setCuisine(clean)
    setDraft('')
  }

  const removeCuisine = (name: Cuisine) => {
    const next = cuisines.filter((known) => known !== name)
    // Never emptied. A dropdown with nothing in it is a control with no way out
    // of itself, and the question it answers still has to be answered.
    if (next.length === 0) return
    keepList(next)
    // The selection follows, or the field would go on naming a kitchen that is
    // no longer on the list while still being what gets sent.
    if (cuisine === name) setCuisine(next[0])
  }

  const cuisineOptions = useMemo(
    () => cuisines.map((name) => ({ value: name, label: name })),
    [cuisines],
  )
  const focusOptions = useMemo(
    () => FOCUSES.map((option) => ({ value: option, label: t(`focus.${option}`) })),
    [t],
  )
  const mealOptions = useMemo(
    () => MEALS.map((option) => ({ value: option, label: t(`meal.${option}`) })),
    [t],
  )

  /**
   * The freshest values to seed FROM, without the seeding depending on them.
   *
   * Both change while the sheet is open — `kcalLeft` moves whenever the day
   * does (a health sync re-reads the last seven days on every foreground), and
   * react-query hands back a new `mealTimes` array on every refetch. Listed as
   * dependencies below, either one re-runs the effect mid-edit and throws away
   * the sitting and the ceiling the user has just chosen, `ownCeiling`
   * included. A ref is read at the moment of seeding and never re-triggers it.
   */
  const latest = useRef({ kcalLeft, mealTimes })
  latest.current = { kcalLeft, mealTimes }

  /**
   * Re-answered on every OPENING, and only then.
   *
   * A `Sheet` is a `Modal` that stays in the tree with `visible={false}`, so
   * state seeded at mount is state from whenever the screen was first drawn —
   * which for Today is the launch. Opened at eight in the evening after a day
   * in the app, the sitting would have been whatever it was at breakfast. The
   * same rule the editing sheets on the food detail screen follow, and for the
   * same reason.
   *
   * The editor is closed on the way in for the same reason: a sheet that opens
   * showing a text field is a sheet asking to be typed into, and the question
   * it is here to ask is the dropdown above it.
   *
   * The trade for depending on `visible` alone is the cold case: meal times
   * that arrive AFTER the sheet is opened do not move the sitting off `snack`.
   * That is the documented fallback rather than a wrong answer, it is one tap
   * from being corrected, and it is a far smaller thing to be wrong about than
   * a form that resets itself while somebody is filling it in.
   */
  useEffect(() => {
    if (!visible) return
    const now = mealAt(new Date(), latest.current.mealTimes)
    setMeal(now)
    setKcalLimit(defaultKcal(latest.current.kcalLeft, now))
    setOwnCeiling(false)
    setEditing(false)
    setDraft('')
    setSession((count) => count + 1)
  }, [visible])

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      fullHeight
      title={t('ask.title')}
      titleAction={
        <View className="flex-row items-center gap-2">
          {/* THE LEAN, ON THE TITLE'S LINE, and tapping it flips it.
           *
           * A two-state pill rather than a fourth dropdown, because it is not
           * another thing to choose between: it is one dial on the question the
           * rest of the sheet is asking, and a field labelled "Health" with two
           * options in it would read as a choice of equal weight with the
           * cuisine and the macros.
           *
           * ALWAYS `selected`, so it is always the raised, filled chip — what
           * changes is its COLOUR, pandan for the lean and kaya for the other.
           * An unselected chip would read as a thing that is off rather than as
           * the other half of a switch, and "Anything" is not off; it is the
           * second of two answers. The colour carries the state, so it is
           * legible without reading the word.
           */}
          <Chip
            selected
            tone={healthy ? 'pandan' : 'kaya'}
            onPress={() => setHealthy((on) => !on)}
            accessibilityRole="switch"
            accessibilityState={{ checked: healthy }}
            accessibilityLabel={t('suggest:ask.healthyA11y')}
            leftIcon={<Icon set="food" name={healthy ? 'leafy-greens' : 'burger'} size={18} />}
          >
            {t(healthy ? 'suggest:ask.healthy' : 'suggest:ask.anything')}
          </Chip>
        </View>
      }
      closeLabel={t('common:action.close')}
      footer={
        // CENTRED and sized to its words, not stretched across the sheet. A
        // full-width bar is the shape of a form's Save, which commits what is
        // above it; this sends a question and closes the sheet behind it. The
        // same shape the picks sheet's own action had before it became a glyph.
        <View className="items-center">
          <Button
            /* `self-center`, because `Button` puts `self-start` on its own
               container and a child's own alignment beats the parent's
               `items-center`. The same trap the sparkle on Today's calorie card
               fell into. */
            className="self-center"
            onPress={() => {
              // Saved when the question is ASKED. A chip tapped and tapped back is
              // not a preference, and neither is a sheet opened and dismissed.
              // The LIST is the exception and has already saved itself.
              savePreferences(userId, { focus, cuisine, cuisines, healthy })
              onAsk({ meal, focus, cuisine, healthy, kcalLimit })
            }}
            loading={busy}
            leftIcon={<Icon set="system" name="sparkle" size={22} />}
          >
            {t('ask.action')}
          </Button>
        </View>
      }
    >
      <View className="gap-md">
        <Group title={t('ask.meal')}>
          <Dropdown
            key={`meal-${session}`}
            options={mealOptions}
            value={meal}
            onChange={chooseMeal}
            accessibilityLabel={t('ask.meal')}
          />
        </Group>

        <Group title={t('ask.focus')}>
          <Dropdown
            key={`focus-${session}`}
            options={focusOptions}
            value={focus}
            onChange={setFocus}
            accessibilityLabel={t('ask.focus')}
          />
        </Group>

        <Group
          title={t('ask.cuisine')}
          action={
            /* THE PENCIL IS THE WHOLE CONTROL, no "Edit" beside it — the same
               rule the three editable groups on the food detail screen follow,
               and the words go to the label instead. It closes the editor as
               well as opening it, so the way out is the way in. */
            <IconButton
              size="xxs"
              hitSlop={10}
              onPress={() => {
                setEditing((on) => !on)
                setDraft('')
              }}
              accessibilityLabel={t('ask.editCuisines')}
              accessibilityState={{ expanded: editing }}
            >
              <Icon set="ui" name={editing ? 'check' : 'edit'} size={18} />
            </IconButton>
          }
        >
          <Dropdown
            key={`cuisine-${session}`}
            options={cuisineOptions}
            value={cuisine}
            onChange={setCuisine}
            accessibilityLabel={t('ask.cuisine')}
          />

          {editing ? (
            /* The list as chips, each of which REMOVES itself, and a field that
               adds one. Chips here and a dropdown above is not the sheet
               contradicting itself: the dropdown answers the question, and this
               is the list being edited — every entry has to be on screen to be
               taken off it, which is the one thing a wrapped row is good at and
               a field is not. */
            <View className="gap-sm pt-1">
              <View className="flex-row flex-wrap gap-2">
                {cuisines.map((name) => (
                  <Chip
                    key={name}
                    onPress={() => removeCuisine(name)}
                    /* Disabled on the last one rather than absent, because a row
                       whose chips lose their × when one is left reads as the app
                       having broken rather than as a floor. */
                    disabled={cuisines.length === 1}
                    accessibilityLabel={t('ask.removeCuisine', { cuisine: name })}
                    leftIcon={<Icon set="ui" name="close" size={14} />}
                  >
                    {name}
                  </Chip>
                ))}
              </View>

              <View className="flex-row items-center gap-2">
                <TextField
                  containerClassName="flex-1"
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={t('ask.addCuisinePlaceholder')}
                  maxLength={MAX_CUISINE_LENGTH}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={addCuisine}
                  accessibilityLabel={t('ask.addCuisine')}
                />
                <IconButton
                  variant="primary"
                  onPress={addCuisine}
                  disabled={cleanCuisine(draft).length === 0 || cuisines.length >= MAX_CUISINES}
                  accessibilityLabel={t('ask.addCuisine')}
                >
                  <Icon set="ui" name="plus" size={20} />
                </IconButton>
              </View>
            </View>
          ) : null}
        </Group>

        <View className="gap-sm">
          {/* The section's label and what is left of the day, on one line and at
              one size. The figure was a pill beside the sheet's title, which put
              it three sections above the only control it is context FOR; here it
              is read WITH the ceiling being set against it, and at the label's
              own weight it annotates the section rather than competing with it.

              Absent on an account with no budget, and on a day already spent:
              "0 kcal left" beside a question about what to eat is a sentence
              about failure, and this screen is not the place for it. */}
          <View className="flex-row items-center justify-between gap-md">
            <Text variant="overlineSm">{t('ask.limit')}</Text>
            {showLeft && kcalLeft > 0 ? (
              <Text variant="overlineSm" className="text-pandan-ink">
                {t('suggest:ask.leftToday', { kcal: kcalLeft.toLocaleString() })}
              </Text>
            ) : null}
          </View>
          {/* The stepper and the slider are one control in two grips, not two
              controls. Fifty at a time is how somebody arrives at "about 500",
              and the slider is how they find out that 500 is most of what is
              left. Both write the same number, so neither has a state of its
              own to disagree with. */}
          <Stepper
            value={kcalLimit}
            onChange={chooseKcal}
            step={KCAL_STEP}
            min={MIN_KCAL}
            max={MAX_KCAL}
            unit={t('ask.kcal')}
            format={(value) => value.toLocaleString()}
            accessibilityLabel={t('ask.limit')}
            decrementLabel={t('ask.less')}
            incrementLabel={t('ask.more')}
          />
          <Slider
            value={kcalLimit}
            onChange={chooseKcal}
            min={MIN_KCAL}
            max={MAX_KCAL}
            step={KCAL_STEP}
            accessibilityLabel={t('ask.limit')}
            format={(value) => value.toLocaleString()}
          />
        </View>
      </View>
    </Sheet>
  )
}
