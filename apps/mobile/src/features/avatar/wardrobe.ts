import type { Json } from '@/lib/database.types'
import { AVATAR_LAYERS, type AvatarLayerName } from './layers.generated'

/**
 * What the avatar can wear (README: The avatar on Today).
 *
 * Every item is one or two images on the shared canvas in `layers.generated.ts`,
 * and an id here is the stable name saved in `user_settings.avatar`. Renaming
 * an id is deleting it: an outfit saved under the old name falls back to that
 * slot's default on every phone.
 */

export type AvatarBase = 'guy' | 'girl'

export const BASES: readonly AvatarBase[] = ['guy', 'girl']

/** The slots in the order the customise screen offers them. */
export const SLOTS = ['hair', 'top', 'bottom', 'shoes', 'headwear', 'accessory', 'held'] as const
export type Slot = (typeof SLOTS)[number]

/**
 * Item ids per slot, in display order. Every item is open to both bases: the
 * two share one body, so a bob or a songkok fits either.
 */
export const WARDROBE = {
  hair: [
    'bedhead',
    'side-part',
    'buzz',
    'curtain',
    'curly',
    'spiky',
    'chopstick-bun',
    'long',
    'bob',
    'braids',
    'ponytail',
    'wavy',
  ],
  top: ['tee', 'batik', 'hibiscus', 'stripe', 'overshirt', 'raglan', 'jersey', 'gingham', 'puff'],
  bottom: ['shorts', 'denim', 'track', 'chinos', 'sarong', 'skirt'],
  shoes: ['sneakers', 'green', 'yellow', 'selipar', 'sandals'],
  headwear: ['cap', 'back-cap', 'bucket', 'flower-bucket', 'songkok', 'straw', 'tudung'],
  accessory: ['glasses', 'shades', 'flower'],
  held: ['teh-tarik', 'ice-bag', 'satay', 'ais-krim'],
} as const satisfies Record<Slot, readonly string[]>

export type ItemId<S extends Slot> = (typeof WARDROBE)[S][number]

/** Slots that can be empty. The rest always draw something. */
export const OPTIONAL: Record<Slot, boolean> = {
  hair: false,
  top: false,
  bottom: false,
  shoes: false,
  headwear: true,
  accessory: true,
  held: true,
}

/** Headwear that covers the hair, the ears and the neck. */
export const HIDES_HAIR: ReadonlySet<string> = new Set(['tudung'])

export type Outfit = {
  base: AvatarBase
  hair: ItemId<'hair'>
  top: ItemId<'top'>
  bottom: ItemId<'bottom'>
  shoes: ItemId<'shoes'>
  headwear: ItemId<'headwear'> | null
  accessory: ItemId<'accessory'> | null
  held: ItemId<'held'> | null
}

/** Each base's own hair: the chill guy's bedhead and the girl's chopstick bun. */
export const DEFAULT_HAIR: Record<AvatarBase, ItemId<'hair'>> = {
  guy: 'bedhead',
  girl: 'chopstick-bun',
}

/** The plain outfit from the brief: pandan tee, brown shorts, white sneakers. */
export function defaultOutfit(base: AvatarBase): Outfit {
  return {
    base,
    hair: DEFAULT_HAIR[base],
    top: 'tee',
    bottom: 'shorts',
    shoes: 'sneakers',
    headwear: null,
    accessory: null,
    held: null,
  }
}

function pick<S extends Slot>(slot: S, value: unknown): ItemId<S> | undefined {
  return typeof value === 'string' && (WARDROBE[slot] as readonly string[]).includes(value)
    ? (value as ItemId<S>)
    : undefined
}

/**
 * The stored object, read defensively. It came from any version of the app, so
 * an id this build does not know (an item added later) falls back to the
 * slot's default rather than drawing nothing, and so does anything malformed.
 */
export function parseOutfit(stored: unknown, fallbackBase: AvatarBase): Outfit {
  const value = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  const record = value as Record<string, unknown>
  const base: AvatarBase =
    record.base === 'guy' || record.base === 'girl' ? record.base : fallbackBase
  const fallback = defaultOutfit(base)
  return {
    base,
    hair: pick('hair', record.hair) ?? fallback.hair,
    top: pick('top', record.top) ?? fallback.top,
    bottom: pick('bottom', record.bottom) ?? fallback.bottom,
    shoes: pick('shoes', record.shoes) ?? fallback.shoes,
    headwear: pick('headwear', record.headwear) ?? null,
    accessory: pick('accessory', record.accessory) ?? null,
    held: pick('held', record.held) ?? null,
  }
}

/** What is stored: the outfit as it is shown, slot by slot. */
export function serialiseOutfit(outfit: Outfit): Json {
  return { ...outfit }
}

/**
 * The outfit on another base. The hair follows while it is still the old
 * base's own, so the guy does not inherit the girl's chopstick bun nobody chose.
 */
export function withBase(outfit: Outfit, base: AvatarBase): Outfit {
  if (base === outfit.base) return outfit
  const hair = outfit.hair === DEFAULT_HAIR[outfit.base] ? DEFAULT_HAIR[base] : outfit.hair
  return { ...outfit, base, hair }
}

/** The outfit with one slot changed. */
export function withItem(outfit: Outfit, slot: Slot, item: string | null): Outfit {
  return { ...outfit, [slot]: item } as Outfit
}

/**
 * What a free account wears: the default outfit on the base it chose. The
 * saved outfit is kept, so it comes back the day the subscription does.
 */
export function freeOutfit(outfit: Outfit): Outfit {
  return defaultOutfit(outfit.base)
}

/** Used by the tests: every item and its layers exist on the canvas. */
export function layersOfItem(slot: Slot, item: string): AvatarLayerName[] {
  const names =
    slot === 'hair'
      ? [`hair-${item}-front`, `hair-${item}-back`]
      : slot === 'headwear'
        ? [`hat-${item}`]
        : slot === 'accessory'
          ? [`acc-${item}`]
          : [`${slot}-${item}`]
  return names.filter((name): name is AvatarLayerName => name in AVATAR_LAYERS)
}
