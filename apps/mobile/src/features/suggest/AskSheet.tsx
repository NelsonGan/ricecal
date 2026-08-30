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
 * The ask sheet: four questions, none of which has to be answered.
 *
 * Every control opens on an answer, which is the opposite of onboarding's first
 * screen and right for the opposite reason: a prefilled sitting costs nothing to
 * be wrong about, because the answer is a list of suggestions rather than a plan.
 * Somebody who opens this at seven in the evening should get dinner.
 *
 * The sitting comes off the user's own meal times (see `mealAt`) and the ceiling
 * off what is left of the day.
 *
 * Full height for two reasons: the form plus the ceiling exceeds the 440pt a
 * capped body gets, so the calorie limit would sit behind the footer, and the
 * cuisine editor raises the keyboard, which a capped sheet handles by padding the
 * panel up off the bottom edge.
 *
 * It keeps its footer, unlike the other full-height sheets, which drop theirs
 * because a footer lands behind the keyboard. That costs only while the editor is
 * open, and the editor has an Add button of its own inside the body.
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
   * The three answers that are about taste, seeded from what was sent last time.
   * Read once at mount rather than on every opening: re-reading storage would
   * undo a choice made and not yet sent. See `preferences.ts` for why the sitting
   * and the ceiling are not among them.
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
   * Bumped on every opening, and used as the dropdowns' `key`. A `Sheet` stays in
   * the tree with `visible={false}`, so a `Dropdown` left expanded is still
   * expanded next time it rises. Whether a list is open is the one piece of state
   * this screen does not own, so remounting clears it and nothing is lost.
   */
  const [session, setSession] = useState(0)
  /**
   * Whether the ceiling is the user's number or the sheet's guess. The guess
   * depends on the sitting, so changing the sitting has to move it, or somebody
   * who taps Dinner mid-afternoon is asked to find one in 300 kcal. Once they
   * have set a figure it is theirs.
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
   * A kitchen is added and the list is saved there rather than when the question
   * is asked. The three answers around it are saved on Ask, because a chip tapped
   * and tapped back is not a preference; a cuisine somebody typed out is work,
   * and the list is a thing they are curating rather than an answer.
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
   * The freshest values to seed from, without the seeding depending on them.
   * Both change while the sheet is open, and as dependencies either one re-runs
   * the effect mid-edit and throws away the sitting and the ceiling the user has
   * just chosen. A ref is read at the moment of seeding and never re-triggers it.
   */
  const latest = useRef({ kcalLeft, mealTimes })
  latest.current = { kcalLeft, mealTimes }

  /**
   * Re-answered on every opening, and only then. A `Sheet` stays in the tree with
   * `visible={false}`, so state seeded at mount is state from the launch, and a
   * sheet opened at eight in the evening would carry the sitting it had at
   * breakfast.
   *
   * The editor is closed on the way in for the same reason: a sheet that opens
   * showing a text field is asking to be typed into.
   *
   * Depending on `visible` alone means meal times arriving after the sheet is
   * opened do not move the sitting off `snack`, which is the documented fallback
   * and one tap from being corrected.
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
           * A two-state pill rather than a fourth dropdown: it is one dial on the
           * question the rest of the sheet is asking, and a field labelled
           * "Health" would read as a choice of equal weight with the cuisine.
           *
           * Always `selected`, so it is always the raised, filled chip, and what
           * changes is its colour. An unselected chip would read as off, and
           * "Anything" is not off but the second of two answers.
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
