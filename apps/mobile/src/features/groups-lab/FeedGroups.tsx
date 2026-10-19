import { type Href, useRouter } from 'expo-router'
import { View } from 'react-native'
import { ScreenTitle } from '@/features/shared/ScreenTitle'
import { Badge, type BadgeTone, Button, Card, Icon, IconButton, Tabs, Text, useToast } from '@/ui'
import { type Art, MEMBERS, type Member, member } from './data'
import { LabScreen } from './LabScreen'
import { Meter, People } from './parts'

type Group = {
  name: string
  href: Href
  art: Art
  who: readonly Member[]
  status: string
  badge: string
  badgeTone: BadgeTone
  track: string
  progress?: number
}

/** One group per direction, so the segment can be read with all four side by side. */
const GROUPS: readonly Group[] = [
  {
    name: 'Gym Kakis',
    href: '/labs/groups/streak',
    art: { set: 'body', name: 'flame-burn' },
    who: MEMBERS,
    status: '4 of 5 in today',
    badge: '12 day streak',
    badgeTone: 'kaya',
    track: 'Food and workouts',
  },
  {
    name: 'Family',
    href: '/labs/groups/challenge?step=board',
    art: { set: 'system', name: 'trophy' },
    who: MEMBERS,
    status: 'Protein Hunter, day 9 of 14',
    badge: 'You are #2',
    badgeTone: 'water',
    track: 'Food only',
  },
  {
    name: 'Makan Kakis',
    href: '/labs/groups/table',
    art: { set: 'dishes', name: 'chicken-rice' },
    who: (['you', 'wei', 'arif', 'priya'] as const).map(member),
    status: 'Arif logged all 3 meals today',
    badge: '3 new',
    badgeTone: 'hibiscus',
    track: 'Food only',
  },
  {
    name: 'Lunch Kakis',
    href: '/labs/groups/pact?step=week',
    art: { set: 'dishes', name: 'kopi-o' },
    who: MEMBERS,
    status: 'Pact 68% this week',
    badge: '2 days left',
    badgeTone: 'pandan',
    track: 'Food only',
    progress: 0.68,
  },
]

/**
 * Where groups would live: a third segment on Feed, beside Following and
 * Discover. Each card leads with the one number that matters for its group.
 */
export function FeedGroups() {
  const router = useRouter()
  const toast = useToast()

  return (
    <LabScreen
      header={
        <View className="gap-1">
          <ScreenTitle
            title="Feed"
            trailing={
              <View className="flex-row items-center">
                <IconButton size="sm" variant="ghost" accessibilityLabel="People">
                  <Icon set="ui" name="search" size={21} />
                </IconButton>
                <IconButton size="sm" variant="ghost" accessibilityLabel="Notifications">
                  <Icon set="ui" name="notification" size={22} />
                </IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  accessibilityLabel="Back to the lab"
                  onPress={() => router.back()}
                >
                  <Icon set="ui" name="profile" size={22} />
                </IconButton>
              </View>
            }
          />
          <Tabs
            value="groups"
            align="center"
            accessibilityLabel="Feed"
            options={[
              { value: 'following', label: 'Following' },
              { value: 'discover', label: 'Discover' },
              { value: 'groups', label: 'Groups' },
            ]}
            onChange={(next) => {
              if (next !== 'groups') toast.show({ title: 'Following and Discover are unchanged' })
            }}
          />
        </View>
      }
    >
      {GROUPS.map((g) => (
        <Card key={g.name} onPress={() => router.push(g.href)} accessibilityRole="button">
          <View className="flex-row items-center gap-3">
            <View className="h-[64px] w-[64px] items-center justify-center rounded-tile bg-surface-alt">
              <Icon {...g.art} size={44} />
            </View>
            <View className="min-w-0 flex-1 gap-1.5">
              <View className="flex-row items-center justify-between gap-2">
                <Text variant="subtitle" numberOfLines={1} className="shrink">
                  {g.name}
                </Text>
                <Badge tone={g.badgeTone} size="sm">
                  {g.badge}
                </Badge>
              </View>
              <People who={g.who} size="sm" />
              <Text variant="meta" numberOfLines={1}>
                {g.status}
              </Text>
              {g.progress === undefined ? null : <Meter value={g.progress} />}
              <Text variant="caption">{g.track}</Text>
            </View>
          </View>
        </Card>
      ))}

      <Card tone="pandan">
        <View className="flex-row items-center gap-3">
          <Icon set="system" name="users-group" size={56} />
          <View className="min-w-0 flex-1">
            <Text variant="subtitle">Keep each other going</Text>
            <Text variant="meta">Start a group with friends, or join one with a code.</Text>
          </View>
        </View>
        <View className="flex-row gap-2">
          <Button size="sm" onPress={() => router.push('/labs/groups/pact')}>
            Start a group
          </Button>
          <Button size="sm" variant="secondary" onPress={() => router.push('/labs/groups/join')}>
            Join with a code
          </Button>
        </View>
      </Card>
    </LabScreen>
  )
}
