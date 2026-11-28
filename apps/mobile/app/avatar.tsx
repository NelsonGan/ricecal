import { Image } from 'expo-image'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, View } from 'react-native'

import {
  type AvatarBase,
  type AvatarCrop,
  AvatarFigure,
  BASES,
  type Outfit,
  SLOTS,
  type Slot,
  useAvatar,
  useSaveAvatar,
  WARDROBE,
} from '@/features/avatar'
import { AVATAR_LAYERS, type AvatarLayerName } from '@/features/avatar/layers.generated'
import { OPTIONAL, withBase, withItem } from '@/features/avatar/wardrobe'
import { useRequirePro } from '@/features/paywall'
import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Badge,
  Button,
  Card,
  cn,
  Icon,
  Screen,
  Tappable,
  Text,
  usePaneWidth,
  useToast,
} from '@/ui'

/**
 * The part of the figure each slot's tiles show, on the avatar canvas: the
 * head for hair, the feet for shoes. Square, because the tiles are.
 */
const CROPS: Record<Slot, AvatarCrop> = {
  hair: { x: 58, y: 0, w: 380, h: 380 },
  headwear: { x: 58, y: 0, w: 380, h: 380 },
  accessory: { x: 96, y: 70, w: 380, h: 380 },
  top: { x: 108, y: 330, w: 280, h: 280 },
  bottom: { x: 108, y: 470, w: 280, h: 280 },
  shoes: { x: 138, y: 548, w: 220, h: 220 },
  held: { x: 190, y: 372, w: 300, h: 300 },
}

const COLUMNS = 4
const GAP = 8

/** Each slot's tab drawing: one of the wardrobe's own pieces. */
const SLOT_ICON: Record<Slot, AvatarLayerName> = {
  hair: 'hair-bob-front',
  top: 'top-tee',
  bottom: 'bottom-shorts',
  shoes: 'shoes-sneakers',
  headwear: 'hat-bucket',
  accessory: 'acc-shades',
  held: 'held-teh-tarik',
}

/** Head and shoulders, for the guy and girl cards. */
const PORTRAIT: AvatarCrop = { x: 58, y: 0, w: 380, h: 400 }

/** The outfit as it would be on the other base, bare-headed so the face shows. */
function portraitOf(outfit: Outfit, base: AvatarBase): Outfit {
  return { ...withBase(outfit, base), headwear: null, held: null }
}

function BaseCard({
  outfit,
  label,
  selected,
  onPress,
}: {
  outfit: Outfit
  label: string
  selected: boolean
  onPress: () => void
}) {
  const [width, setWidth] = useState(0)
  const portrait = Math.min(78, width * 0.5)
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      className={cn(
        'flex-1 items-center overflow-hidden rounded-[20px] border-[3px] bg-surface pt-2',
        selected ? 'border-pandan' : 'border-line',
      )}
    >
      {width > 0 ? (
        <AvatarFigure
          outfit={outfit}
          state={{ mood: 'onTrack' }}
          width={portrait}
          crop={PORTRAIT}
          animated={false}
        />
      ) : (
        <View style={{ height: 100 }} />
      )}
      <Text variant="label" className={cn('pb-2', selected ? 'text-pandan-ink' : 'text-muted')}>
        {label}
      </Text>
      {selected ? (
        <View className="absolute right-2 top-2 h-6 w-6 items-center justify-center rounded-full bg-pandan">
          <Icon set="ui" name="check" size={14} tintColor="#FFFFFF" />
        </View>
      ) : null}
    </Tappable>
  )
}

function SlotTab({
  slot,
  outfit,
  label,
  selected,
  onPress,
}: {
  slot: Slot
  outfit: Outfit
  label: string
  selected: boolean
  onPress: () => void
}) {
  const layer = AVATAR_LAYERS[SLOT_ICON[slot]]
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className="items-center gap-1"
    >
      <View
        className={cn(
          'h-[46px] w-[46px] items-center justify-center rounded-[14px] border-2',
          // A pale tile in both themes, as exercise drawings sit on: dark
          // sunglasses or a black songkok vanish on a dark one.
          'bg-exercise-tile',
          selected ? 'border-pandan' : 'border-line',
        )}
      >
        {slot === 'hair' ? (
          // A hairstyle on its own is a wig with a hole for the face; on a head
          // it reads as hair.
          <AvatarFigure
            outfit={{ ...outfit, headwear: null }}
            state={{ mood: 'onTrack' }}
            width={36}
            crop={CROPS.hair}
            animated={false}
          />
        ) : (
          <Image source={layer.source} style={{ width: 32, height: 32 }} contentFit="contain" />
        )}
      </View>
      <Text variant="micro" className={selected ? 'text-pandan-ink' : 'text-muted'}>
        {label}
      </Text>
    </Tappable>
  )
}

function same(a: Outfit, b: Outfit): boolean {
  return (Object.keys(a) as (keyof Outfit)[]).every((key) => a[key] === b[key])
}

/**
 * Your avatar: dress the figure on Today (README: The avatar on Today).
 *
 * The base is everybody's to choose; the wardrobe is Pro. A free account
 * sees every piece and is offered Pro when it taps one, rather than a screen
 * of padlocks it cannot try.
 *
 * Each tile is the avatar itself wearing that piece, cropped to where it goes,
 * so the choice is made on the body it will be worn on. The figure at the top
 * eats a spoon of rice when tapped, which is what it does on Today when a
 * meal lands.
 */
export default function AvatarScreen() {
  const { t } = useTranslation(['avatar', 'common'])
  const back = useBack('/today')
  const toast = useToast()
  const width = usePaneWidth()
  const { saved, outfit: shown, free, loading } = useAvatar()
  const { save, saving } = useSaveAvatar()
  const requirePro = useRequirePro()

  const [draft, setDraft] = useState<Outfit | null>(null)
  const [slot, setSlot] = useState<Slot>('hair')
  const [eating, setEating] = useState(false)

  // A free account edits what it can see, the plain outfit; anyone else, Pro
  // or not yet known, edits the saved one, so a save made while the answer is
  // still coming can never write the defaults over a Pro wardrobe.
  const baseline = free ? shown : saved
  const current = draft ?? baseline
  const dirty = !same(current, baseline)

  // Nothing is editable until the saved outfit has loaded: an edit of the
  // placeholder would be saved over the real one.
  const chooseBase = (base: AvatarBase) => {
    if (!loading && base !== current.base) setDraft(withBase(current, base))
  }

  const choose = (item: string | null) => {
    if (loading || !requirePro('avatar')) return
    setDraft(withItem(current, slot, item))
  }

  const onSave = async () => {
    try {
      // A free account changes only its base; the wardrobe it saved under Pro
      // stays put for the day it comes back.
      await save(free ? withBase(saved, current.base) : current)
      setDraft(null)
      toast.show({ title: t('saved'), tone: 'success', icon: { set: 'ui', name: 'check' } })
      back()
    } catch {
      toast.show({ title: t('saveFailed'), tone: 'warning' })
    }
  }

  const stage = Math.min(160, Math.round(width * 0.38))
  // Measured rather than worked out from the screen, so the card's padding
  // and an iPad's reading column never push the fourth tile onto a new row.
  const [grid, setGrid] = useState(0)
  const tile = Math.floor((grid - GAP * (COLUMNS - 1)) / COLUMNS)
  const items: (string | null)[] = [
    ...(OPTIONAL[slot] ? [null] : []),
    ...(WARDROBE[slot] as readonly string[]),
  ]

  return (
    <Screen
      header={<AppBar title={t('title')} onBack={() => back()} backLabel={t('common:a11y.back')} />}
      footer={
        <Button fullWidth disabled={!dirty || loading} loading={saving} onPress={onSave}>
          {t('save')}
        </Button>
      }
    >
      <Tappable
        onPress={() => setEating(true)}
        haptics={false}
        accessibilityRole="image"
        accessibilityLabel={t('title')}
        className="items-center overflow-hidden rounded-[28px] bg-pandan-soft pt-4"
      >
        <View
          className="absolute rounded-full bg-pandan-soft-line"
          style={{ width: stage * 0.8, height: stage * 0.11, bottom: 14 }}
        />
        <AvatarFigure
          outfit={current}
          state={{ mood: 'onTrack', action: eating ? 'eating' : undefined }}
          width={stage}
          onActionEnd={() => setEating(false)}
        />
      </Tappable>

      {/* Guy or girl, as the two of them rather than two words. */}
      <View
        className="flex-row gap-3"
        accessibilityRole="radiogroup"
        accessibilityLabel={t('base.label')}
      >
        {BASES.map((base) => (
          <BaseCard
            key={base}
            outfit={portraitOf(current, base)}
            label={t(`base.${base}`)}
            selected={current.base === base}
            onPress={() => chooseBase(base)}
          />
        ))}
      </View>

      {/* The slots, each drawn as the thing it holds. Seven fit across a phone,
          and scroll on anything narrower. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-5"
        contentContainerStyle={{
          paddingHorizontal: 20,
          gap: 6,
          flexGrow: 1,
          justifyContent: 'space-between',
        }}
      >
        {SLOTS.map((option) => (
          <SlotTab
            key={option}
            slot={option}
            outfit={current}
            label={t(`slot.${option}`)}
            selected={option === slot}
            onPress={() => setSlot(option)}
          />
        ))}
      </ScrollView>

      <Card
        title={t(`slot.${slot}`)}
        action={free ? <Badge tone="kaya">{t('pro')}</Badge> : undefined}
      >
        <View
          className="flex-row flex-wrap"
          style={{ gap: GAP }}
          onLayout={(event) => setGrid(event.nativeEvent.layout.width)}
        >
          {tile > 0 &&
            items.map((item) => {
              const selected = current[slot] === item
              const label = item === null ? t('none') : t(`item.${slot}.${item}` as never)
              return (
                <Tappable
                  key={item ?? 'none'}
                  onPress={() => choose(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={label}
                  className={cn(
                    'items-center justify-center overflow-hidden rounded-[14px] border-2 bg-surface-alt',
                    selected ? 'border-pandan' : 'border-transparent',
                  )}
                  style={{ width: tile, height: tile }}
                >
                  <AvatarFigure
                    // A hat hides most of a hairstyle and a flower behind the ear, so those
                    // are tried on bare-headed.
                    outfit={withItem(
                      slot === 'hair' || slot === 'accessory'
                        ? withItem(current, 'headwear', null)
                        : current,
                      slot,
                      item,
                    )}
                    state={{ mood: 'onTrack' }}
                    width={tile - 4}
                    crop={CROPS[slot]}
                    animated={false}
                  />
                  {item === null ? (
                    <View className="absolute inset-x-0 bottom-1 items-center">
                      <View className="rounded-full bg-surface px-1.5">
                        <Text variant="micro" className="text-muted">
                          {label}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  {selected ? (
                    <View className="absolute right-1 top-1 h-5 w-5 items-center justify-center rounded-full bg-pandan">
                      <Icon set="ui" name="check" size={12} tintColor="#FFFFFF" />
                    </View>
                  ) : null}
                </Tappable>
              )
            })}
        </View>
      </Card>
    </Screen>
  )
}
