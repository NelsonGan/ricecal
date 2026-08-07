import { View } from 'react-native'

import { Text } from '@/ui'

/**
 * The steps, as steps.
 *
 * `recipes.steps` is one free-text column and it has to stay that way: it is
 * typed by hand as often as it is filled in from a model, and a cook who wants
 * to write two lines about their mother's version should be able to. So the
 * column holds text, and the LIST is a property of how it is drawn.
 *
 * Which means the numbering lives here rather than in the data. Numbered on the
 * way in, an "1." would be a literal part of the string: it would double up
 * against these numerals, survive into the field the user edits by hand, and
 * renumber nothing when a step was deleted from the middle.
 */
export function RecipeSteps({ steps }: { steps: string }) {
  const rows = keyed(splitSteps(steps))
  if (rows.length === 0) return null

  return (
    <View className="gap-3">
      {rows.map(({ line, key }, index) => (
        <View key={key} className="flex-row items-start gap-3">
          <View className="h-[26px] w-[26px] items-center justify-center rounded-full bg-pandan-soft">
            <Text variant="caption" className="text-pandan-ink">
              {index + 1}
            </Text>
          </View>
          <Text variant="body" className="min-w-0 flex-1 text-muted">
            {line}
          </Text>
        </View>
      ))}
    </View>
  )
}

/**
 * A stable identity per step, without reaching for the index.
 *
 * The sentence alone will not do: a method that says "Stir." twice would hand
 * React the same key for two different rows. So it is the sentence and how many
 * times it has been seen, which is unique and survives a step being inserted
 * above it.
 */
const keyed = (lines: string[]): Array<{ line: string; key: string }> => {
  const seen = new Map<string, number>()
  return lines.map((line) => {
    const nth = (seen.get(line) ?? 0) + 1
    seen.set(line, nth)
    return { line, key: `${line}#${nth}` }
  })
}

/**
 * Free text into one instruction a line.
 *
 * The server does this to what the model writes (`_shared/recipe.ts`), and this
 * is the same rule applied to what a person types — because a cook who typed
 * their method as one paragraph wants the same list back as one who pressed
 * return between the steps, and neither of them should have to know which they
 * did.
 *
 * Leading markers come off for the same reason they come off on the server:
 * somebody who numbered their own steps gets those numbers drawn beside these
 * ones otherwise.
 */
export function splitSteps(steps: string): string[] {
  return (
    (steps ?? '')
      .split('\n')
      // A full stop followed by the start of another sentence. It needs the
      // capital, so "1.5 kg" and "approx. 20 minutes" stay in one piece.
      .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z"'(])/))
      .map((line) => line.replace(/^\s*(?:step\s*)?(?:\d+\s*[.):]|[-*•·])\s*/i, '').trim())
      .filter(Boolean)
  )
}
