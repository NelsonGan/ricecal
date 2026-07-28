import { useState } from 'react'
import { View } from 'react-native'

import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  CalorieRing,
  Card,
  Divider,
  EmptyState,
  Icon,
  ListRow,
  MacroBar,
  ProgressBar,
  Skeleton,
  SkeletonRow,
  Spinner,
  StatTile,
  Text,
  WaterTracker,
  type WeekDay,
  WeekStrip,
} from '@/ui'

const WEEK: WeekDay[] = [
  { key: '2026-07-20', initial: 'M', status: 'logged' },
  { key: '2026-07-21', initial: 'T', status: 'logged' },
  { key: '2026-07-22', initial: 'W', status: 'logged' },
  { key: '2026-07-23', initial: 'T', status: 'over' },
  { key: '2026-07-24', initial: 'F', status: 'logged' },
  { key: '2026-07-25', initial: 'S', status: 'today' },
  { key: '2026-07-26', initial: 'S', status: 'empty' },
]

export function DataSection() {
  const [water, setWater] = useState(5)
  const [eaten, setEaten] = useState(1487)

  return (
    <>
      <Card title="Calorie ring" action={<Badge>On track</Badge>}>
        <View className="items-center gap-md">
          <CalorieRing value={eaten} goal={2100} />
          <View className="flex-row gap-2">
            <Button size="sm" variant="neutral" onPress={() => setEaten(900)}>
              40%
            </Button>
            <Button size="sm" variant="neutral" onPress={() => setEaten(1950)}>
              93%
            </Button>
            <Button size="sm" variant="neutral" onPress={() => setEaten(2350)}>
              112%
            </Button>
          </View>
          <Text variant="meta" className="text-center">
            Turns kaya at 90%, hibiscus past 100%. Never alarm styling.
          </Text>
        </View>
      </Card>

      <Card title="Remaining today" action={<Badge>On track</Badge>}>
        <Text variant="displayLg">
          613{' '}
          <Text variant="numeric" className="text-muted">
            kcal
          </Text>
        </Text>
        <ProgressBar value={0.68} className="my-md" />
        <View className="flex-row gap-md">
          <MacroBar label="Carbs" amount="182g" value={0.74} tone="kaya" />
          <MacroBar label="Protein" amount="61g" value={0.52} tone="hibiscus" />
          <MacroBar label="Fat" amount="44g" value={0.63} tone="teh" />
        </View>
      </Card>

      <Card title="Weekly streak" action={<Badge tone="kaya">12 days</Badge>}>
        <WeekStrip days={WEEK} />
        <Text variant="meta" className="mt-md">
          Kaya square = logged but over goal. Still counts.
        </Text>
      </Card>

      <Card
        title="Water"
        action={
          <Text className="font-display text-[20px] leading-[24px] text-water-ink">
            {water} / 8
          </Text>
        }
      >
        <WaterTracker filled={water} goal={8} onChange={setWater} />
      </Card>

      <Card title="Stat tiles" flush>
        <View className="flex-row gap-3 p-card">
          <StatTile className="flex-1" label="7 day avg" value="68.6 kg" caption="0.3 kg down" />
          <StatTile
            className="flex-1"
            tone="pandan"
            label="Pace"
            value="0.3 kg"
            caption="Per week"
          />
          <StatTile className="flex-1" tone="kaya" label="Goal date" value="18 Nov" />
        </View>
      </Card>

      <Card title="List rows" flush>
        <View className="px-card py-2">
          <ListRow
            title="Daily goal"
            subtitle="2,100 kcal"
            leading={<Icon set="system" name="sync" size={40} />}
            onPress={() => {}}
          />
          <ListRow
            title="Units"
            subtitle="Metric (kg, ml)"
            leading={<Icon set="body" name="height-ruler" size={40} />}
            onPress={() => {}}
          />
          <ListRow
            title="Reminders"
            subtitle="3 active"
            leading={<Icon set="system" name="bell" size={40} />}
            trailing={<Badge tone="neutral">3</Badge>}
            divider={false}
            onPress={() => {}}
          />
        </View>
      </Card>

      <Card title="Profile">
        <View className="flex-row items-center gap-md">
          <Avatar name="Aisyah R." size="lg" />
          <View className="flex-1 gap-0.5">
            <Text variant="subtitle">Aisyah R.</Text>
            <Text variant="meta">Member since March, 12 day streak</Text>
          </View>
        </View>
        <Divider className="my-md" />
        <AvatarGroup names={['Aisyah', 'Bakri', 'Chen', 'Devi', 'Eshan', 'Farah', 'Gan']} />
      </Card>

      <Card title="Loading">
        <Spinner label="Looking up nutrition" />
        <Divider className="my-md" />
        <View className="gap-3">
          <SkeletonRow />
          <SkeletonRow />
          <Skeleton width="40%" height={22} rounded={false} />
        </View>
      </Card>

      <Card title="Empty state" flush>
        <EmptyState
          icon={{ set: 'food', name: 'plate-rice' }}
          title="Nothing logged yet"
          description="Add your first meal and we'll start counting."
          action={<Button onPress={() => {}}>Log now</Button>}
        />
      </Card>
    </>
  )
}
