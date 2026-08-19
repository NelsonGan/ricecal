import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

import type { MealPick, SuggestRequest } from '@/data'
import { useThemeColors } from '@/theme/useTheme'
import { EmptyState, Icon, IconButton, Sheet, Text } from '@/ui'
import { ItemRow } from '../shared/ItemRow'
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
}

/**
 * What was asked for, in one line, so the list has a subject.
 *
 * "Protein heavy, Malay, under 500 kcal" — the three constraints in the order
 * they were set, which is also the order they matter in. The MEAL is not in it:
 * the heading already says "Five for dinner", and a subtitle repeating it is a
 * line spent saying nothing.
 */
function Summary({ request }: { request: SuggestRequest }) {
  const { t } = useTranslation('suggest')
  return (
    <Text variant="meta">
      {t('picks.summary', {
        focus: t(`focusShort.${request.focus}`),
        cuisine: t(`cuisine.${request.cuisine}`),
        kcal: request.kcalLimit.toLocaleString(),
      })}
    </Text>
  )
}

/**
 * L9 PICKS SHEET: five things to eat, and the way back to the question.
 *
 * ONE SHEET FOR THE WAIT AND THE ANSWER, rather than a thinking sheet that
 * closes and a picks sheet that opens. Two modals in sequence is two rises, two
 * scrims and a frame of the diary in between; the panel is already up when the
 * answer lands, so the answer simply replaces the wait inside it.
 *
 * FULL HEIGHT, so the panel is the same size throughout. A capped sheet sizes
 * itself to its content, so the wait and the answer would be two different
 * heights and the panel would jump at the one moment this screen has to feel
 * settled — with the reader's eye on it. At full height nothing moves but the
 * content, which is also why the wait draws FIVE skeleton rows rather than
 * three: it stands in for exactly what is coming.
 *
 * TRY AGAIN IS AN ICON, on the title's line. It was a full-width footer button,
 * which is the shape of a primary action — and on a screen whose whole point is
 * the five things above it, "ask again" is the secondary one. As a glyph beside
 * the heading it stays reachable and quiet, and it leaves the panel with no
 * footer at all, so the list runs the full height of the sheet.
 *
 * The rows are `ItemRow`, which is what every other list in this app is made
 * of, and the detail under each name is its PROTEIN. That is a choice about
 * this screen rather than a default: the calorie figure is already on the right
 * of the row, and protein is the number that distinguishes five dishes that all
 * come in under the same ceiling.
 *
 * VIEW ONLY. There is no add button on a row and no "Log it" on the detail
 * behind it. These are guesses about meals nobody has eaten, and a diary priced
 * from a guess is the thing the cascade's estimate tier had to be unwound for.
 * Somebody who eats one logs it the ordinary way, and the catalogue prices it.
 */
export function PicksSheet({
  visible,
  onClose,
  request,
  picks,
  busy,
  onRetry,
  onPressPick,
}: PicksSheetProps) {
  const { t } = useTranslation(['suggest', 'common'])
  const colors = useThemeColors()

  const summary = request ? <Summary request={request} /> : null

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      fullHeight
      closeLabel={t('common:action.close')}
      title={t('picks.title', { meal: request ? t(`mealFor.${request.meal}`) : '' })}
      titleAction={
        // Present in both states and DISABLED while the model works, rather
        // than absent: a control that appears when the answer lands moves the
        // title beside it, which is the one line that must not move.
        <IconButton
          size="sm"
          onPress={busy ? undefined : onRetry}
          disabled={busy}
          accessibilityLabel={t('picks.retry')}
        >
          <Icon set="ui" name="refresh" size={18} tintColor={colors.muted} />
        </IconButton>
      }
    >
      {busy ? (
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
        /* Faded in over the skeleton it replaces. The two are the same shape in
           the same place, so a hard cut reads as the screen flickering rather
           than as an answer arriving; 220ms is long enough to register as a
           transition and short enough not to be waited through. */
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

          {/* Said once, at the foot of the list, rather than beside every
              figure. These are the model's estimates for dishes nobody has
              cooked yet, and the app counts nothing until a meal is logged. */}
          <Text variant="micro">{t('picks.estimateNote')}</Text>
        </Animated.View>
      )}
    </Sheet>
  )
}
