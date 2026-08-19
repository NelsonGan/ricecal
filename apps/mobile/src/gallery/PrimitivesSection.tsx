import { useState } from 'react'
import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'

import {
  Badge,
  Button,
  Card,
  Chip,
  CountBadge,
  Divider,
  Icon,
  IconButton,
  type IconProps,
  Text,
} from '@/ui'

// Typed as IconProps[] rather than inferred: a tuple array widens `set` to the
// full union, which breaks the per-set narrowing of `name`.
const SAMPLE_ICONS: IconProps[] = [
  { set: 'ui', name: 'home' },
  { set: 'ui', name: 'diary' },
  { set: 'ui', name: 'trends' },
  { set: 'ui', name: 'profile' },
  { set: 'system', name: 'camera' },
  { set: 'system', name: 'barcode' },
  { set: 'system', name: 'microphone' },
  { set: 'dishes', name: 'nasi-lemak' },
  { set: 'dishes', name: 'roti-canai' },
  { set: 'dishes', name: 'char-kuey-teow' },
  { set: 'dishes', name: 'teh-tarik' },
  { set: 'food', name: 'plate-rice' },
  { set: 'body', name: 'running-shoe' },
  { set: 'body', name: 'weighing-scale' },
  { set: 'body', name: 'streak-chain' },
]

const FILTERS = ['Halal', 'Mamak', 'Kopitiam', 'Vegetarian', 'Less sugar']

export function PrimitivesSection() {
  const colors = useThemeColors()
  const [selected, setSelected] = useState<string[]>(['Halal'])
  const [busy, setBusy] = useState(false)

  const toggle = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))

  return (
    <>
      <Card title="Typography">
        <View className="gap-2">
          <Text variant="displayLg">1,847</Text>
          <Text variant="title">Good morning, Aisyah</Text>
          <Text variant="heading">Nasi lemak ayam berempah</Text>
          <Text variant="body">
            A medium portion is about 640 kcal. Adding a fried egg? We keep the count, no guilt,
            just numbers.
          </Text>
          <Text variant="bodyStrong">Roti canai banjir</Text>
          <Text variant="label">Daily goal</Text>
          <Text variant="meta">Mamak · 1 piece · most ordered near you</Text>
          <Text variant="caption">Green dot = fully logged day</Text>
          <Text variant="overline">Remaining today</Text>
        </View>
      </Card>

      <Card title="Buttons">
        <View className="flex-row flex-wrap items-center gap-3">
          <Button onPress={() => {}}>Add food</Button>
          <Button variant="secondary" onPress={() => {}}>
            Maybe later
          </Button>
          <Button variant="danger" onPress={() => {}}>
            Delete
          </Button>
          <Button variant="kaya" onPress={() => {}}>
            12 day streak
          </Button>
          <Button variant="neutral" onPress={() => {}}>
            Keep
          </Button>
          <Button variant="ghost" onPress={() => {}}>
            Skip
          </Button>
          <Button disabled>Save</Button>
        </View>

        <Divider className="my-md" />

        <View className="flex-row flex-wrap items-center gap-3">
          <Button size="sm" onPress={() => {}}>
            Small
          </Button>
          <Button
            loading={busy}
            onPress={() => {
              setBusy(true)
              setTimeout(() => setBusy(false), 1600)
            }}
          >
            Tap to load
          </Button>
        </View>

        <Button
          size="lg"
          fullWidth
          className="mt-md"
          leftIcon={<Icon set="ui" name="plus" size={22} tintColor={colors.onPandan} />}
          onPress={() => {}}
        >
          Get started
        </Button>
      </Card>

      <Card title="Icon buttons">
        <View className="flex-row items-center gap-3">
          <IconButton size="sm" accessibilityLabel="Back" onPress={() => {}}>
            <Icon set="ui" name="chevron-left" size={20} />
          </IconButton>
          <IconButton variant="primary" accessibilityLabel="Add" onPress={() => {}}>
            <Icon set="ui" name="plus" size={26} tintColor={colors.onPandan} />
          </IconButton>
          <IconButton variant="subtle" accessibilityLabel="Remove" onPress={() => {}}>
            <Icon set="ui" name="minus" size={26} />
          </IconButton>
          <IconButton size="lg" accessibilityLabel="Help" onPress={() => {}}>
            <Icon set="system" name="help" size={30} />
          </IconButton>
          <IconButton variant="ghost" accessibilityLabel="More" onPress={() => {}}>
            <Icon set="ui" name="more-horizontal" size={24} />
          </IconButton>
        </View>
      </Card>

      <Card title="Chips" action={<CountBadge count={selected.length} />}>
        <View className="flex-row flex-wrap items-start gap-2">
          {FILTERS.map((name) => (
            <Chip key={name} selected={selected.includes(name)} onPress={() => toggle(name)}>
              {name}
            </Chip>
          ))}
        </View>
        <Divider className="my-md" />
        <View className="flex-row flex-wrap items-start gap-2">
          <Chip soft>½ plate</Chip>
          <Chip soft tone="kaya">
            1 bowl
          </Chip>
          <Chip soft tone="water">
            1 cup
          </Chip>
          <Chip soft tone="hibiscus">
            1 piece
          </Chip>
        </View>
      </Card>

      <Card title="Badges">
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge>On track</Badge>
          <Badge tone="kaya">Double check</Badge>
          <Badge tone="hibiscus">Over goal</Badge>
          <Badge tone="water">Hydrated</Badge>
          <Badge tone="neutral">Draft</Badge>
          <CountBadge count={3} />
          <CountBadge count={128} />
        </View>
      </Card>

      <Card title="Card tones" flush>
        <View className="gap-3 p-card">
          <Card tone="pandan" title="Pandan">
            <Text variant="meta">Logged for Wednesday.</Text>
          </Card>
          <Card tone="kaya" title="Kaya">
            <Text variant="meta">This portion looks larger than usual.</Text>
          </Card>
          <Card tone="hibiscus" title="Hibiscus">
            <Text variant="meta">We could not reach the food database.</Text>
          </Card>
          <Card tone="water" title="Water">
            <Text variant="meta">1.25 L of 2 L today.</Text>
          </Card>
          <Card tone="inverse" title="Fasting mode">
            <Text variant="display" className="text-on-inverse">
              4h 12m
            </Text>
            <Text variant="meta" className="text-on-inverse opacity-70">
              until iftar · 7:24 pm
            </Text>
          </Card>
        </View>
      </Card>

      <Card title="Icons">
        <View className="flex-row flex-wrap gap-4">
          {SAMPLE_ICONS.map((icon) => (
            <View key={`${icon.set}/${icon.name}`} className="w-[64px] items-center gap-1">
              <Icon {...icon} size={44} />
              <Text variant="caption" className="text-center text-[10px] leading-[13px]">
                {icon.name}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Card title="Divider">
        <Divider />
        <View className="h-md" />
        <Divider dashed />
      </Card>
    </>
  )
}
