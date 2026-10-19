import { type Href, useRouter } from 'expo-router'
import { View } from 'react-native'
import { AppBar, Badge, type BadgeTone, Card, Icon, Text } from '@/ui'
import { type Art, MEMBERS, type Member, member } from './data'
import { LabScreen } from './LabScreen'
import { Meter, People } from './parts'

type Direction = {
  letter: string
  label: string
  href: Href
  group: string
  art: Art
  who: readonly Member[]
  status: string
  badge: string
  badgeTone: BadgeTone
  /** Shown as a bar under the status, for the directions that are a percentage. */
  progress?: number
}

/**
 * Each direction appears as the card its group would get in a Groups segment
 * on Feed, so the list doubles as a look at that segment.
 */
const DIRECTIONS: readonly Direction[] = [
  {
    letter: 'A',
    label: 'Streak Circle',
    href: '/labs/groups/streak',
    group: 'Gym Kakis',
    art: { set: 'body', name: 'flame-burn' },
    who: MEMBERS,
    status: '4 of 5 logged today',
    badge: '12 day streak',
    badgeTone: 'kaya',
  },
  {
    letter: 'B',
    label: 'Challenge League',
    href: '/labs/groups/challenge',
    group: 'Family',
    art: { set: 'system', name: 'trophy' },
    who: MEMBERS,
    status: 'Protein Hunter, day 9 of 14',
    badge: 'You are #2',
    badgeTone: 'water',
  },
  {
    letter: 'C',
    label: 'Makan Table',
    href: '/labs/groups/table',
    group: 'Makan Kakis',
    art: { set: 'dishes', name: 'chicken-rice' },
    who: (['you', 'wei', 'arif', 'priya'] as const).map(member),
    status: 'Arif logged all 3 meals today',
    badge: '3 new',
    badgeTone: 'hibiscus',
  },
  {
    letter: 'D',
    label: 'Weekly Pact',
    href: '/labs/groups/pact',
    group: 'Lunch Kakis',
    art: { set: 'dishes', name: 'kopi-o' },
    who: MEMBERS,
    status: 'Pact 68% this week',
    badge: 'Food only',
    badgeTone: 'pandan',
    progress: 0.68,
  },
]

/**
 * The way into the groups prototypes. Not reachable from the app's own
 * navigation: open `ricecal:///labs/groups` on a development build.
 */
export function GroupsLabHub() {
  const router = useRouter()

  return (
    <LabScreen header={<AppBar title="Groups lab" onBack={() => router.back()} backLabel="Back" />}>
      <Text variant="meta">
        Four directions for groups, each a tap-through prototype on made-up data. Every card is what
        that group would look like in a Groups segment on Feed.
      </Text>

      {DIRECTIONS.map((d) => (
        <View key={d.letter} className="gap-1.5">
          <Text variant="overline">
            {d.letter}. {d.label}
          </Text>
          <Card onPress={() => router.push(d.href)} accessibilityRole="button">
            <View className="flex-row items-center gap-3">
              <View className="h-[64px] w-[64px] items-center justify-center rounded-tile bg-surface-alt">
                <Icon {...d.art} size={44} />
              </View>
              <View className="min-w-0 flex-1 gap-1.5">
                <View className="flex-row items-center justify-between gap-2">
                  <Text variant="subtitle" numberOfLines={1} className="shrink">
                    {d.group}
                  </Text>
                  <Badge tone={d.badgeTone} size="sm">
                    {d.badge}
                  </Badge>
                </View>
                <People who={d.who} size="sm" />
                <Text variant="meta" numberOfLines={1}>
                  {d.status}
                </Text>
                {d.progress === undefined ? null : <Meter value={d.progress} />}
              </View>
            </View>
          </Card>
        </View>
      ))}

      <Text variant="overline">Where groups live</Text>
      <Card onPress={() => router.push('/labs/groups/feed')} accessibilityRole="button">
        <View className="flex-row items-center gap-3">
          <View className="h-[64px] w-[64px] items-center justify-center rounded-tile bg-surface-alt">
            <Icon set="system" name="users-group" size={44} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="bodyStrong">Feed, Groups segment</Text>
            <Text variant="meta">All four groups as they would sit on Feed</Text>
          </View>
          <Icon set="ui" name="chevron-right" size={20} />
        </View>
      </Card>

      <Text variant="overline">Joining</Text>
      <Card onPress={() => router.push('/labs/groups/join')} accessibilityRole="button">
        <View className="flex-row items-center gap-3">
          <View className="h-[64px] w-[64px] items-center justify-center rounded-tile bg-pandan-soft">
            <Icon set="system" name="user-add" size={40} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="bodyStrong">Open an invite link</Text>
            <Text variant="meta">What a friend sees when you share a group</Text>
          </View>
          <Icon set="ui" name="chevron-right" size={20} />
        </View>
      </Card>
    </LabScreen>
  )
}
