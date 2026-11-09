import '@/i18n'
import { render, screen } from '@/test-utils'
import { FoldedFigures } from '../FoldedFigures'
import { newWorkout } from '../model'
import { receivePulse } from '../pulse'

/**
 * The folded heart rate and burn row on the live workout. With a watch
 * streaming, both figures are masked out of session replays, and a mask is a
 * view labelled "ph-no-capture". VoiceOver and TalkBack read a button that has
 * no label of its own by joining its children's labels, so the row was read
 * as "ph-no-capture, ph-no-capture, button".
 */

// The estimate's body comes from the diary; the watch's figures need none.
jest.mock('../energyBody', () => ({ useEnergyBody: () => undefined }))
// The live document's clock, without the diary it is kept beside.
jest.mock('../live', () => ({ useNow: () => Date.now() }))

const workout = newWorkout({ id: 'w-folded', name: 'Push', startedAt: Date.now() - 60_000 })

const MASK = 'ph-no-capture'

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null }

/**
 * Masks counted as `[masks, spoken]`: spoken is a mask inside a button with no
 * label of its own, which a screen reader reads out as the mask's label.
 */
function masks(node: Node | string | null, labelled = false, inButton = false): [number, number] {
  if (!node || typeof node === 'string') return [0, 0]
  const label = node.props.accessibilityLabel
  if (label === MASK) {
    const [all, spoken] = walk(node, labelled, inButton)
    return [all + 1, spoken + (inButton && !labelled ? 1 : 0)]
  }
  const accessible = node.props.accessible === true
  return walk(node, labelled || (accessible && Boolean(label)), inButton || accessible)
}

function walk(node: Node, labelled: boolean, inButton: boolean): [number, number] {
  let all = 0
  let spoken = 0
  for (const child of node.children ?? []) {
    const [a, s] = masks(child, labelled, inButton)
    all += a
    spoken += s
  }
  return [all, spoken]
}

const row = () =>
  render(
    <FoldedFigures
      workout={workout}
      pulsing
      hint="Heart rate, Burned"
      onPress={() => {}}
      chevron={null}
    />,
  )

it('says the figures a watch streams rather than the replay mask', async () => {
  receivePulse({ workoutId: workout.id, bpm: 128, kcal: 230.4, at: Date.now() })
  await row()

  const button = screen.getByRole('button')
  expect(button.props.accessibilityLabel).toBe('128 bpm, 230 kcal')
  expect(button.props.accessibilityHint).toBe('Heart rate, Burned')
  // Both figures are still masked for replays, and neither mask is read out.
  expect(masks(screen.toJSON() as Node)).toEqual([2, 0])
  expect(screen.getByText('128 bpm')).toBeTruthy()
  expect(screen.getByText('230 kcal')).toBeTruthy()
})
