import type { Json } from '@/lib/database.types'

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

/** Every item id per slot, both bases together, in display order. */
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
  bottom: ['shorts', 'denim', 'track', 'chinos', 'sarong', 'skirt', 'kain-batik'],
  shoes: ['sneakers', 'green', 'yellow', 'selipar', 'sandals'],
  headwear: ['cap', 'back-cap', 'bucket', 'flower-bucket', 'songkok', 'straw', 'tudung'],
  accessory: ['glasses', 'shades', 'flower'],
  held: ['teh-tarik', 'ice-bag', 'satay', 'ais-krim'],
} as const satisfies Record<Slot, readonly string[]>

export type ItemId<S extends Slot> = (typeof WARDROBE)[S][number]

type Wardrobe = { readonly [S in Slot]: readonly ItemId<S>[] }

/**
 * What each base can wear. The two share one body, so any piece would fit
 * either, but a wardrobe is a choice of what the character would wear: no
 * skirt or tudung on the guy, no kain pelikat or songkok on the girl, and
 * each keeps the hairstyles drawn for them.
 */
const FOR_BASE: Record<AvatarBase, Wardrobe> = {
  guy: {
    hair: ['bedhead', 'side-part', 'buzz', 'curtain', 'curly', 'spiky'],
    top: ['tee', 'batik', 'hibiscus', 'stripe', 'overshirt', 'raglan', 'jersey', 'gingham'],
    bottom: ['shorts', 'denim', 'track', 'chinos', 'sarong'],
    shoes: WARDROBE.shoes,
    headwear: ['cap', 'back-cap', 'bucket', 'flower-bucket', 'songkok', 'straw'],
    accessory: ['glasses', 'shades'],
    held: WARDROBE.held,
  },
  girl: {
    hair: ['chopstick-bun', 'long', 'bob', 'braids', 'ponytail', 'wavy'],
    top: ['tee', 'puff', 'batik', 'hibiscus', 'stripe', 'overshirt', 'raglan', 'jersey', 'gingham'],
    bottom: ['shorts', 'skirt', 'kain-batik', 'denim', 'track', 'chinos'],
    shoes: WARDROBE.shoes,
    headwear: ['tudung', 'straw', 'flower-bucket', 'bucket', 'cap', 'back-cap'],
    accessory: ['glasses', 'shades', 'flower'],
    held: WARDROBE.held,
  },
}

/** The items a base can wear in a slot, in display order. */
export function itemsFor<S extends Slot>(base: AvatarBase, slot: S): readonly ItemId<S>[] {
  return FOR_BASE[base][slot] as readonly ItemId<S>[]
}

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
const DEFAULT_HAIR: Record<AvatarBase, ItemId<'hair'>> = {
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

function pick<S extends Slot>(base: AvatarBase, slot: S, value: unknown): ItemId<S> | undefined {
  return typeof value === 'string' && (itemsFor(base, slot) as readonly string[]).includes(value)
    ? (value as ItemId<S>)
    : undefined
}

/**
 * The stored object, read defensively. An id this build does not know, one the
 * base does not wear, or anything malformed falls back to the slot's default
 * rather than drawing nothing.
 */
export function parseOutfit(stored: unknown, fallbackBase: AvatarBase): Outfit {
  const value = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  const record = value as Record<string, unknown>
  const base: AvatarBase =
    record.base === 'guy' || record.base === 'girl' ? record.base : fallbackBase
  const fallback = defaultOutfit(base)
  return {
    base,
    hair: pick(base, 'hair', record.hair) ?? fallback.hair,
    top: pick(base, 'top', record.top) ?? fallback.top,
    bottom: pick(base, 'bottom', record.bottom) ?? fallback.bottom,
    shoes: pick(base, 'shoes', record.shoes) ?? fallback.shoes,
    headwear: pick(base, 'headwear', record.headwear) ?? null,
    accessory: pick(base, 'accessory', record.accessory) ?? null,
    held: pick(base, 'held', record.held) ?? null,
  }
}

/** What is stored: the outfit as it is shown, slot by slot. */
export function serialiseOutfit(outfit: Outfit): Json {
  return { ...outfit }
}

/**
 * The outfit on another base. What the new base also wears stays on; the rest
 * becomes its default (the guy's bedhead for the girl's bun, shorts for a
 * skirt, no tudung).
 */
export function withBase(outfit: Outfit, base: AvatarBase): Outfit {
  if (base === outfit.base) return outfit
  return parseOutfit({ ...outfit, base }, base)
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
