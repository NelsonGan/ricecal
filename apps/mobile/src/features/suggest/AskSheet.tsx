import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Cuisine, Focus, Meal } from '@/data'
import { useMealTimes, useUserId } from '@/data'
import { Badge, Button, Chip, Icon, Sheet, Slider, Stepper, Tappable, Text } from '@/ui'
import {
  CUISINES,
  defaultKcal,
  FOCUS_ICONS,
  FOCUSES,
  KCAL_STEP,
  MAX_KCAL,
  MEALS,
  MIN_KCAL,
  mealAt,
} from './ask'
import { readPreferences, savePreferences } from './preferences'

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

/** A section of the sheet: its label, and the row of chips under it. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-sm">
      <Text variant="overlineSm">{title}</Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
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
 * the answer is five suggestions rather than a plan. Somebody who opens this at
 * seven in the evening and presses the button straight away should get dinner.
 *
 * The sitting comes off the user's OWN meal times rather than off a table of
 * hours — see `mealAt` — and the ceiling off what is left of the day.
 *
 * FULL HEIGHT, and not because of a keyboard. There is no text field here — the
 * rule in CLAUDE.md about a sheet with typing in it does not apply — but four
 * groups of chips plus the ceiling come to more than the 440pt a capped body
 * gets, and what a capped sheet does with the overflow is hide the calorie
 * limit behind the footer and leave the reader to find it by scrolling. The one
 * control on this sheet that is not a chip is the one that ends up out of sight.
 *
 * It KEEPS its footer, unlike the other full-height sheets in the app. Theirs is
 * dropped because a footer sits outside the scroll view and lands behind the
 * keyboard; nothing here raises one.
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
  const [cuisine, setCuisine] = useState<Cuisine>(remembered.cuisine)
  const [healthy, setHealthy] = useState(remembered.healthy)
  const [kcalLimit, setKcalLimit] = useState(MIN_KCAL)
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
           * A two-state pill rather than a fifth chip group, because it is not
           * another thing to choose between: it is one dial on the question the
           * rest of the sheet is asking, and a group of two chips labelled
           * "Healthier" and "Anything" would read as a choice of equal weight
           * with the cuisine and the macros.
           *
           * Its own colour changes with it — pandan for the lean, kaya for the
           * other — so the state is legible without reading the word, which is
           * what a control has to manage when it is this small.
           */}
          <Tappable
            onPress={() => setHealthy((on) => !on)}
            accessibilityRole="switch"
            accessibilityState={{ checked: healthy }}
            accessibilityLabel={t('suggest:ask.healthyA11y')}
          >
            <Badge tone={healthy ? 'pandan' : 'kaya'}>
              <Icon set="food" name={healthy ? 'leafy-greens' : 'burger'} size={16} />
              <Text variant="caption" className={healthy ? 'text-pandan-ink' : 'text-kaya-ink'}>
                {t(healthy ? 'suggest:ask.healthy' : 'suggest:ask.anything')}
              </Text>
            </Badge>
          </Tappable>

          {/* What is left of the day, beside the question it is asked against.
           *
           * It was a green caption under the slider, which is where a figure
           * goes when nobody has decided where it belongs: three sections below
           * the heading, under the one control it is context FOR, and read
           * after the ceiling had already been set.
           *
           * Absent on an account with no budget, and on a day already spent:
           * "0 kcal left" beside a question about what to eat is a sentence
           * about failure, and this screen is not the place for it.
           */}
          {showLeft && kcalLeft > 0 ? (
            // NEUTRAL, and it is the one badge on this sheet that should be.
            // Pandan would collide with the toggle beside it whenever the lean
            // is on, and water means DRINKING water everywhere else in the app —
            // a blue pill carrying a calorie figure is the colour system saying
            // something untrue. This is a reading rather than a state, and grey
            // is what a reading looks like.
            <Badge tone="neutral">
              <Text variant="caption">
                {t('suggest:ask.leftToday', { kcal: kcalLeft.toLocaleString() })}
              </Text>
            </Badge>
          ) : null}
        </View>
      }
      closeLabel={t('common:action.close')}
      footer={
        <Button
          onPress={() => {
            // Saved when the question is ASKED. A chip tapped and tapped back is
            // not a preference, and neither is a sheet opened and dismissed.
            savePreferences(userId, { focus, cuisine, healthy })
            onAsk({ meal, focus, cuisine, healthy, kcalLimit })
          }}
          loading={busy}
          leftIcon={<Icon set="system" name="sparkle" size={22} />}
        >
          {t('ask.action')}
        </Button>
      }
    >
      <View className="gap-md">
        <Group title={t('ask.meal')}>
          {MEALS.map((option) => (
            <Chip key={option} selected={meal === option} onPress={() => chooseMeal(option)}>
              {t(`meal.${option}`)}
            </Chip>
          ))}
        </Group>

        <Group title={t('ask.focus')}>
          {FOCUSES.map((option) => (
            <Chip
              key={option}
              selected={focus === option}
              onPress={() => setFocus(option)}
              leftIcon={<Icon {...FOCUS_ICONS[option]} size={20} />}
            >
              {t(`focus.${option}`)}
            </Chip>
          ))}
        </Group>

        <Group title={t('ask.cuisine')}>
          {CUISINES.map((option) => (
            <Chip key={option} selected={cuisine === option} onPress={() => setCuisine(option)}>
              {t(`cuisine.${option}`)}
            </Chip>
          ))}
        </Group>

        <View className="gap-sm">
          <Text variant="overlineSm">{t('ask.limit')}</Text>
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
