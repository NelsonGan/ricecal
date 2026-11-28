import { AVATAR_LAYERS, HAT_HAIR_CLIP } from '../layers.generated'
import { calorieMood, MOODS, moodPose } from '../mood'
import { buildStack } from '../stack'
import { ACTIONS, DISSOLVE_MS, sample, windowOpacity } from '../timeline'
import {
  BASES,
  defaultOutfit,
  freeOutfit,
  HIDES_HAIR,
  layersOfItem,
  parseOutfit,
  SLOTS,
  serialiseOutfit,
  WARDROBE,
  withBase,
} from '../wardrobe'

const has = (name: string) => name in AVATAR_LAYERS

describe('calorieMood', () => {
  const mood = (eatenKcal: number, logged = eatenKcal > 0) =>
    calorieMood({ eatenKcal, budgetKcal: 2000, logged })

  it('is hungry before anything is logged', () => {
    expect(mood(0)).toBe('hungry')
  })

  it('counts a logged zero-calorie drink as a started day', () => {
    expect(mood(0, true)).toBe('onTrack')
  })

  it('walks through the day in order', () => {
    expect(mood(600)).toBe('onTrack')
    expect(mood(1500)).toBe('close')
    expect(mood(1900)).toBe('satisfied')
    expect(mood(2000)).toBe('satisfied')
    // A little over the target is still a day that went to plan.
    expect(mood(2100)).toBe('satisfied')
    expect(mood(2200)).toBe('over')
    expect(mood(2700)).toBe('stuffed')
  })

  it('never divides by a missing budget', () => {
    expect(calorieMood({ eatenKcal: 500, budgetKcal: 0, logged: true })).toBe('onTrack')
  })
})

describe('poses', () => {
  it('moves a thumbs up to the free hand when something is held', () => {
    expect(moodPose('close', false)).toMatchObject({ armL: 'pocket', armR: 'thumb' })
    expect(moodPose('close', true)).toMatchObject({ armL: 'thumb', armR: 'hold' })
  })

  it('ends the eating motion on the new mood, with the spoon first', () => {
    const motion = ACTIONS.eating('over', false)
    expect(motion.segments[0]?.pose).toMatchObject({ face: 'bite', armR: 'eat', spoon: 'full' })
    expect(motion.segments.at(-1)?.pose).toEqual(moodPose('over', false))
    for (const track of Object.values(motion.channels)) {
      expect(track.every(([t]) => t >= 0 && t <= motion.duration)).toBe(true)
      // keys in time order, or sampling would jump
      expect(track.every(([t], i) => i === 0 || t >= (track[i - 1]?.[0] ?? 0))).toBe(true)
    }
  })

  it('brings the arm down before the hand goes back to the tummy', () => {
    const motion = ACTIONS.eating('onTrack', false)
    const handBack = motion.segments.find((s) => s.pose.armR !== 'eat')?.from ?? 0
    expect(sample(motion.channels.lift, handBack, 0)).toBeCloseTo(0, 2)
  })
})

describe('the drawings', () => {
  it('has every item of every slot', () => {
    for (const slot of SLOTS) {
      for (const item of WARDROBE[slot]) {
        expect([slot, item, layersOfItem(slot, item).length > 0]).toEqual([slot, item, true])
      }
    }
  })

  it('has every face on both bases, the eating ones included', () => {
    for (const base of BASES) {
      for (const mood of MOODS) {
        const face = moodPose(mood, false).face
        expect([`face-${base}-${face}`, has(`face-${base}-${face}`)]).toEqual([
          `face-${base}-${face}`,
          true,
        ])
      }
      expect([`face-${base}-bite`, has(`face-${base}-bite`)]).toEqual([`face-${base}-bite`, true])
      expect([`face-${base}-chew`, has(`face-${base}-chew`)]).toEqual([`face-${base}-chew`, true])
    }
  })

  it('has both halves of every arm pose the moods and eating use', () => {
    const poses = new Set<string>()
    for (const mood of MOODS) {
      for (const holding of [false, true]) {
        const pose = moodPose(mood, holding)
        poses.add(`arm-L-${pose.armL}-over`)
        poses.add(`arm-R-${pose.armR}-over`)
      }
    }
    poses.add('arm-R-eat-over')
    for (const name of poses) expect([name, has(name)]).toEqual([name, true])
    expect(['held-spoon-full', has('held-spoon-full')]).toEqual(['held-spoon-full', true])
    expect(['held-spoon-empty', has('held-spoon-empty')]).toEqual(['held-spoon-empty', true])
  })

  it('knows how far down each hat covers the hair', () => {
    for (const hat of WARDROBE.headwear) {
      expect(HAT_HAIR_CLIP[hat] === null).toBe(HIDES_HAIR.has(hat))
    }
  })
})

describe('parseOutfit', () => {
  it('starts an account that never saved one on its profile’s base', () => {
    expect(parseOutfit({}, 'girl')).toEqual(defaultOutfit('girl'))
    expect(parseOutfit(null, 'guy').hair).toBe('bedhead')
  })

  it('reads a saved outfit', () => {
    const saved = { ...defaultOutfit('guy'), top: 'batik', headwear: 'songkok' }
    expect(parseOutfit(saved, 'girl')).toEqual(saved)
  })

  it('falls back per slot on an id this build does not know', () => {
    const outfit = parseOutfit(
      { base: 'girl', hair: 'mohawk', top: 'batik', headwear: 'crown' },
      'guy',
    )
    expect(outfit).toMatchObject({ base: 'girl', hair: 'chopstick-bun', top: 'batik' })
    expect(outfit.headwear).toBeNull()
  })

  it('shows a free account the default outfit on its base, keeping the saved one', () => {
    const saved = { ...defaultOutfit('girl'), top: 'puff' as const }
    expect(freeOutfit(saved)).toEqual(defaultOutfit('girl'))
  })
})

describe('buildStack', () => {
  const names = (outfit = defaultOutfit('guy'), mood = moodPose('onTrack', false)) =>
    buildStack(outfit, mood).map((entry) => entry.name)

  it('draws hair behind the body and in front of the face', () => {
    const stack = names({ ...defaultOutfit('girl'), hair: 'long' })
    expect(stack.indexOf('hair-long-back')).toBeGreaterThanOrEqual(0)
    expect(stack.indexOf('hair-long-back')).toBeLessThan(stack.indexOf('body'))
    expect(stack.indexOf('face-girl-on-track')).toBeLessThan(stack.indexOf('hair-long-front'))
  })

  it('puts the arm a sleeve covers under the top and the hand over it', () => {
    const stack = names(defaultOutfit('guy'), moodPose('satisfied', false))
    expect(stack.indexOf('arm-L-belly-under')).toBeLessThan(stack.indexOf('top-tee'))
    expect(stack.indexOf('arm-L-belly-over')).toBeGreaterThan(stack.indexOf('top-tee'))
  })

  it('hides the hair and ears under a tudung', () => {
    const stack = names({ ...defaultOutfit('girl'), headwear: 'tudung' })
    expect(stack.some((name) => name.startsWith('hair-'))).toBe(false)
    expect(stack).not.toContain('ears')
    expect(stack).toContain('hat-tudung')
  })

  it('clips the hair under a hat', () => {
    const stack = buildStack(
      { ...defaultOutfit('guy'), headwear: 'cap' },
      moodPose('onTrack', false),
    )
    expect(stack.find((entry) => entry.name === 'hair-bedhead-front')?.clipTop).toBe(
      HAT_HAIR_CLIP.cap,
    )
  })

  it('puts the held item in the hand that holds it', () => {
    const stack = names({ ...defaultOutfit('guy'), held: 'satay' }, moodPose('onTrack', true))
    expect(stack).toContain('held-satay')
    expect(stack).toContain('arm-R-hold-over')
  })
})

describe('withBase', () => {
  it('swaps the hair only while it is the old base’s own', () => {
    expect(withBase(defaultOutfit('girl'), 'guy').hair).toBe('bedhead')
    expect(withBase({ ...defaultOutfit('girl'), hair: 'bob' }, 'guy').hair).toBe('bob')
  })
})

describe('serialiseOutfit', () => {
  it('stores every slot, and reads back to the same outfit', () => {
    const outfit = { ...defaultOutfit('girl'), headwear: 'tudung' as const }
    expect(parseOutfit(serialiseOutfit(outfit), 'guy')).toEqual(outfit)
  })
})

describe('timeline sampling', () => {
  it('eases between keys and holds past the ends', () => {
    const track = [
      [0, 0],
      [100, 10],
    ] as const
    expect(sample(track, -5, 0)).toBe(0)
    expect(sample(track, 50, 0)).toBeCloseTo(5)
    expect(sample(track, 25, 0)).toBeLessThan(2.5)
    expect(sample(track, 500, 0)).toBe(10)
    expect(sample(undefined, 50, 3)).toBe(3)
  })

  it('fades a drawing in and cuts it once the next has faded in over it', () => {
    const w = [[100, 300]] as const
    expect(windowOpacity(50, w)).toBe(0)
    expect(windowOpacity(100 + DISSOLVE_MS / 2, w)).toBeCloseTo(0.5)
    expect(windowOpacity(200, w)).toBe(1)
    expect(windowOpacity(300 + DISSOLVE_MS / 2, w)).toBe(1)
    expect(windowOpacity(300 + DISSOLVE_MS, w)).toBe(0)
    expect(windowOpacity(0, [[0, 100]])).toBe(1)
  })
})
