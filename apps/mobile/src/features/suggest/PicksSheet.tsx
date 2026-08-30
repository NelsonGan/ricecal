import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, { FadeIn, SlideInRight } from 'react-native-reanimated'

import type { MealPick, SuggestRequest } from '@/data'
import { useThemeColors } from '@/theme/useTheme'
import { EmptyState, Icon, IconButton, Sheet, Text } from '@/ui'
import { ItemRow } from '../shared/ItemRow'
import { PickDetail } from './PickDetail'
import { Thinking } from './Thinking'

export type PicksSheetProps = {
  visible: boolean
  onClose: () => void
  /** Null while the first answer is still coming. */
  request: SuggestRequest | null
  picks: MealPick[]
  /** The model is working. Draws the wait in place of the list. */
  busy: boolean
  onRetry: () => void
  onPressPick: (index: number) => void
  /** Which pick is being read, or null for the list itself. */
  reading: number | null
  /** Back up from a pick to the list. */
  onBack: () => void
}

/**
 * What was asked for, in one line, so the list has a subject.
 *
 * "Protein heavy, Malay, under 500 kcal" — the three constraints in the order
 * they were set, which is also the order they matter in. The MEAL is not in it:
 * the heading already says "Ideas for dinner", and a subtitle repeating it is a
 * line spent saying nothing.
 */
function Summary({ request }: { request: SuggestRequest }) {
  const { t } = useTranslation('suggest')
  return (
    <Text variant="meta">
      {t('picks.summary', {
        focus: t(`focusShort.${request.focus}`),
        // The cuisine as the user keeps it, not through a translation key:
        // the list is theirs to edit, so most of what can be in here is a word
        // this repo has never seen.
        cuisine: request.cuisine,
        kcal: request.kcalLimit.toLocaleString(),
      })}
    </Text>
  )
}

/**
 * The picks sheet: seven things to eat, the one being read, and the way back to
 * the question.
 *
 * One sheet for all of it. Two modals in sequence is two rises, two scrims and a
 * frame of the diary in between, and a pushed page is worse, because a `Sheet` is
 * a native window over the whole app, so reading two picks was four transitions.
 * The wait, the answer and the pick are three bodies in one panel.
 *
 * Full height, so the panel is the same size throughout: a capped sheet sizes
 * itself to its content, so the panel would jump at the one moment this screen
 * has to feel settled. That is also why the wait draws as many skeleton rows as
 * there are picks coming.
 *
 * It asks again rather than reopening the question (see `onRetry` in
 * `SuggestAction`), so the skeleton comes back up in the list's place. That
 * control is absent rather than disabled while a pick is being read, since a
 * different list under a dish reached by index would answer the wrong thing.
 *
 * The rows are `ItemRow` and the detail under each name is its protein: the
 * calorie figure is already on the right, and protein distinguishes a list of
 * dishes that all come in under the same ceiling.
 *
 * View only. These are guesses about meals nobody has eaten, and a diary priced
 * from a guess is what the cascade's estimate tier had to be unwound for.
 */
export function PicksSheet({
  visible,
  onClose,
  request,
  picks,
  busy,
  onRetry,
  onPressPick,
  reading,
  onBack,
}: PicksSheetProps) {
  const { t } = useTranslation(['suggest', 'common'])
  const colors = useThemeColors()

  const summary = request ? <Summary request={request} /> : null

  /**
   * The pick being read, if there still is one.
   *
   * Indexed rather than held, because a pick has no id — see `data/suggestions`
   * on why nothing here is ever written down. An index that no longer points at
   * anything simply shows the list again, which is the state the reader would
   * have to be sent to anyway.
   */
  const openPick = reading === null ? undefined : picks[reading]

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      // Android's back goes up to the list rather than out of the panel, the
      // same move the chevron makes. Absent on the list itself, where back
      // should dismiss.
      onBack={openPick ? onBack : undefined}
      fullHeight
      closeLabel={t('common:action.close')}
      // The dish while one is open, and its own name is long enough to need the
      // second line that `titleLines` allows.
      title={
        openPick
          ? openPick.name
          : t('picks.title', { meal: request ? t(`mealFor.${request.meal}`) : '' })
      }
      titleLines={openPick ? 2 : 1}
      titleLeading={
        openPick ? (
          <IconButton size="sm" onPress={onBack} accessibilityLabel={t('common:a11y.back')}>
            {/* Tinted, like every other back chevron in the app. */}
            <Icon set="ui" name="chevron-left" size={18} tintColor={colors.muted} />
          </IconButton>
        ) : undefined
      }
      titleAction={
        openPick ? undefined : (
          // Present in both of the LIST's states and DISABLED while the model
          // works, rather than absent: a control that appears when the answer
          // lands moves the title beside it, which is the one line that must not
          // move.
          <IconButton
            size="sm"
            onPress={busy ? undefined : onRetry}
            disabled={busy}
            accessibilityLabel={t('picks.retry')}
          >
            <Icon set="ui" name="refresh" size={18} tintColor={colors.muted} />
          </IconButton>
        )
      }
      // A pick opens at its top rather than at the depth the list was read to.
      scrollResetKey={openPick ? `pick:${reading}` : 'picks'}
    >
      {openPick ? (
        /* From the right, which is the direction a page would have come from.
           The panel is not going anywhere, so the movement is what says this is
           one level down and there is something to come back to. */
        <Animated.View entering={SlideInRight.duration(220)} className="gap-md">
          <PickDetail pick={openPick} date={request?.date} />
        </Animated.View>
      ) : busy ? (
        <Thinking request={request} summary={summary} />
      ) : picks.length === 0 ? (
        /* The model would not answer, which the server reports as an empty list
           rather than as an error — see the note there. Nothing went wrong that
           the user can act on, so this says what happened, and the way to ask
           again is already on the title's line. */
        <EmptyState
          title={t('picks.emptyTitle')}
          description={t('picks.emptyBody')}
          icon={{ set: 'system', name: 'sparkle' }}
        />
      ) : (
        /* Faded in over the skeleton it replaces, and over a pick on the way
           back out of one. The two are the same shape in the same place, so a
           hard cut reads as the screen flickering rather than as an answer
           arriving; 220ms is long enough to register as a transition and short
           enough not to be waited through. */
        <Animated.View entering={FadeIn.duration(220)} className="gap-md">
          {summary}

          <View className="gap-2">
            {picks.map((pick, index) => (
              <ItemRow
                // The name, because there is no id: a pick is not a row in
                // anything. Two picks with one name would be the model
                // repeating itself, which the prompt forbids and which would
                // show up here as a warning rather than as a bug.
                key={pick.name}
                title={pick.name}
                detail={t('picks.protein', { grams: pick.proteinG })}
                icon={pick.icon}
                value={pick.kcal}
                unit={t('ask.kcal')}
                onPress={() => onPressPick(index)}
                // Tinted, like the chevron on every other row in the app.
                trailing={<Icon set="ui" name="chevron-right" size={18} tintColor={colors.faint} />}
              />
            ))}
          </View>
        </Animated.View>
      )}
    </Sheet>
  )
}
