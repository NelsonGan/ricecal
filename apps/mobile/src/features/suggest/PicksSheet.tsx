import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { MealPick, SuggestRequest } from '@/data'
import { useThemeColors } from '@/theme/useTheme'
import { Button, EmptyState, Icon, ProgressBar, Sheet, Skeleton, Text } from '@/ui'
import { ItemRow } from '../shared/ItemRow'

export type PicksSheetProps = {
  visible: boolean
  onClose: () => void
  /** Null while the first answer is still coming. */
  request: SuggestRequest | null
  picks: MealPick[]
  /** The model is working. Draws L8 THINKING in place of the list. */
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
 * L8 THINKING: the wait, with the question still on screen.
 *
 * The progress bar is INDETERMINATE-looking but is not animated to a number,
 * because there is no number: one model call takes between five and fifteen
 * seconds and nothing on this side knows where in that it is. What it is for is
 * the same thing the skeleton rows are for — saying that five rows are coming,
 * so the sheet does not resize under the reader when they arrive.
 *
 * The question is repeated above it deliberately. The sheet that asked it has
 * closed, and ten seconds is long enough to stop being sure what was asked.
 */
function Thinking({ request }: { request: SuggestRequest | null }) {
  const { t } = useTranslation('suggest')

  return (
    <View className="gap-md">
      <View className="flex-row items-center gap-3">
        <View className="h-[52px] w-[52px] items-center justify-center rounded-tile bg-pandan-soft">
          <Icon set="system" name="sparkle" size={28} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="bodyStrong">
            {t('picks.thinking', { meal: request ? t(`mealFor.${request.meal}`) : '' })}
          </Text>
          {request ? <Summary request={request} /> : null}
        </View>
      </View>

      <ProgressBar value={0.66} accessibilityLabel={t('picks.thinkingA11y')} />

      <View className="gap-2">
        <Skeleton className="h-[72px] w-full" />
        <Skeleton className="h-[72px] w-full" />
        <Skeleton className="h-[72px] w-full" />
      </View>
    </View>
  )
}

/**
 * L9 PICKS SHEET: five things to eat, and the way back to the question.
 *
 * ONE SHEET FOR THE WAIT AND THE ANSWER, rather than a thinking sheet that
 * closes and a picks sheet that opens. Two modals in sequence is two rises, two
 * scrims and a frame of the diary in between; the panel is already up when the
 * answer lands, so the answer simply replaces the skeleton inside it.
 *
 * The rows are `ItemRow`, which is what every other list in this app is made
 * of, and the detail under each name is its PROTEIN. That is a choice about
 * this screen and not a default: the calorie figure is already on the right of
 * the row, and protein is the number that distinguishes five dishes that all
 * come in under the same ceiling.
 *
 * VIEW ONLY. There is no add button on a row and no "Log it" on the detail
 * behind it. These are guesses about meals nobody has eaten, and a diary
 * priced from a guess is the thing the cascade's estimate tier had to be
 * unwound for. Somebody who eats one logs it the ordinary way, and the
 * catalogue prices it.
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

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={
        busy ? undefined : t('picks.title', { meal: request ? t(`mealFor.${request.meal}`) : '' })
      }
      footer={
        busy ? (
          /* A way out while it works, and it says CLOSE rather than Cancel.
             The scan is claimed at the top of the endpoint, so there is nothing
             left to cancel by the time this button exists — a label promising
             otherwise would be the app pretending it can take a request back.
             It is also what keeps the panel the same height in both states, so
             the answer replaces the skeleton without the sheet resizing. */
          <Button variant="secondary" onPress={onClose}>
            {t('common:action.close')}
          </Button>
        ) : (
          <Button onPress={onRetry} leftIcon={<Icon set="ui" name="refresh" size={20} />}>
            {t('picks.retry')}
          </Button>
        )
      }
    >
      {busy ? (
        <Thinking request={request} />
      ) : picks.length === 0 ? (
        /* The model would not answer, which the server reports as an empty list
           rather than as an error — see the note there. Nothing went wrong that
           the user can act on, so this says what happened and leaves the button
           in the footer where it already was. */
        <EmptyState
          title={t('picks.emptyTitle')}
          description={t('picks.emptyBody')}
          icon={{ set: 'system', name: 'sparkle' }}
        />
      ) : (
        <View className="gap-md">
          {request ? <Summary request={request} /> : null}

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
        </View>
      )}
    </Sheet>
  )
}
