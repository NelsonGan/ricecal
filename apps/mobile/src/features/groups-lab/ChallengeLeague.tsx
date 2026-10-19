import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { useThemeColors } from '@/theme/useTheme'
import { AppBar, Badge, Button, Card, Chip, cn, Icon, StatTile, Text, useToast } from '@/ui'
import type { Art, Member, Track } from './data'
import { MEMBERS } from './data'
import { LabScreen, useLabParams } from './LabScreen'
import { Meter, Person, PrototypeControls, Section, TrackControl } from './parts'

/**
 * Direction B: a time-boxed challenge with points and a podium. Bursty and
 * competitive, and it ends, which is both its pull (a finish line, a winner)
 * and its risk (the group goes quiet unless somebody presses Rematch).
 */

type TemplateId = 'log' | 'protein' | 'manis' | 'budget' | 'workouts'

type Template = {
  id: TemplateId
  name: string
  line: string
  art: Art
  /** Only offered to a group that counts workouts. */
  needsWorkouts?: boolean
}

const TEMPLATES: readonly Template[] = [
  {
    id: 'log',
    name: 'Log every meal',
    line: 'Breakfast, lunch and dinner',
    art: { set: 'system', name: 'streak-calendar' },
  },
  {
    id: 'protein',
    name: 'Protein Hunter',
    line: 'Hit your protein goal',
    art: { set: 'food', name: 'chicken-drumstick' },
  },
  {
    id: 'manis',
    name: 'Kurang Manis',
    line: 'No sugary drinks',
    art: { set: 'dishes', name: 'teh-tarik' },
  },
  {
    id: 'budget',
    name: 'Under budget',
    line: 'Stay within calories',
    art: { set: 'body', name: 'target' },
  },
  {
    id: 'workouts',
    name: '3 workouts a week',
    line: 'Any session counts',
    art: { set: 'body', name: 'dumbbell' },
    needsWorkouts: true,
  },
]

const LENGTHS = [7, 14, 30] as const

type Earn = { id: string; label: string; pts: number; detail?: string; progress?: number }

/** What a member can still score today, by challenge. The first is already done. */
const EARN: Record<TemplateId, Earn[]> = {
  log: [
    { id: 'breakfast', label: 'Log breakfast', pts: 10 },
    { id: 'lunch', label: 'Log lunch', pts: 10 },
    { id: 'dinner', label: 'Log dinner', pts: 10, detail: 'Not yet' },
  ],
  protein: [
    { id: 'breakfast', label: 'Log breakfast', pts: 10 },
    { id: 'protein', label: 'Hit protein 99g', pts: 30, detail: '82 of 99g', progress: 82 / 99 },
    { id: 'meals', label: 'Log every meal', pts: 20, detail: '2 of 3', progress: 2 / 3 },
  ],
  manis: [
    { id: 'logged', label: 'Log every drink', pts: 10 },
    {
      id: 'clean',
      label: 'No sugary drinks today',
      pts: 30,
      detail: 'Kopi O counts, teh tarik does not',
    },
  ],
  budget: [
    { id: 'breakfast', label: 'Log breakfast', pts: 10 },
    {
      id: 'budget',
      label: 'Stay within 2,500 kcal',
      pts: 30,
      detail: '1,311 so far',
      progress: 1311 / 2500,
    },
    { id: 'meals', label: 'Log every meal', pts: 20, detail: '2 of 3', progress: 2 / 3 },
  ],
  workouts: [
    { id: 'breakfast', label: 'Log breakfast', pts: 10 },
    { id: 'move', label: 'Finish a workout', pts: 30, detail: '1 of 3 this week', progress: 1 / 3 },
  ],
}

const FAMILY: readonly Member[] = [...MEMBERS, { id: 'mum', name: 'Mum', tone: 'water' }]

/** Points before today's taps. Close enough at the top that one target flips it. */
const START_POINTS: Record<string, number> = {
  priya: 720,
  you: 700,
  jun: 590,
  wei: 510,
  arif: 380,
  mum: 300,
}

const STEPS = ['create', 'invite', 'board', 'recap'] as const
type Step = (typeof STEPS)[number]

export function ChallengeLeague() {
  const router = useRouter()
  const toast = useToast()
  const colors = useThemeColors()
  const params = useLabParams()
  const [step, setStep] = useState<Step>(STEPS.find((s) => s === params.step) ?? 'create')
  const [track, setTrack] = useState<Track>(params.track ?? 'food')
  const [templateId, setTemplateId] = useState<TemplateId>('protein')
  const [days, setDays] = useState<(typeof LENGTHS)[number]>(14)
  const [added, setAdded] = useState<string[]>(['priya', 'jun', 'mum'])
  const [earned, setEarned] = useState<string[]>(['breakfast', 'logged'])
  const [clapped, setClapped] = useState(false)

  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0]
  const earn: Earn[] =
    track === 'both' && templateId !== 'workouts'
      ? [...EARN[templateId], { id: 'move', label: 'Finish a workout', pts: 30 }]
      : EARN[templateId]
  const bonus = earn.filter(
    (e) => earned.includes(e.id) && e.id !== 'breakfast' && e.id !== 'logged',
  )
  const points: Record<string, number> = {
    ...START_POINTS,
    you: START_POINTS.you + bonus.reduce((sum, e) => sum + e.pts, 0),
  }
  const ranked = [...FAMILY].sort((a, b) => (points[b.id] ?? 0) - (points[a.id] ?? 0))
  const myRank = ranked.findIndex((m) => m.id === 'you') + 1

  const pickTrack = (next: Track) => {
    setTrack(next)
    if (next === 'food' && template.needsWorkouts) setTemplateId('protein')
  }

  const score = (item: Earn) => {
    const wasRank = myRank
    setEarned((current) => [...current, item.id])
    const mine = points.you + item.pts
    const nowFirst = mine > (points.priya ?? 0)
    toast.show({
      title: `+${item.pts} points`,
      description: nowFirst && wasRank !== 1 ? 'You just passed Priya. You are #1.' : item.label,
      tone: 'success',
    })
  }

  if (step === 'create') {
    return (
      <LabScreen
        header={
          <AppBar
            title="New challenge"
            onBack={() => router.back()}
            backLabel="Back"
            action={<Text variant="caption">1 of 2</Text>}
          />
        }
        footer={
          <Button fullWidth onPress={() => setStep('invite')}>
            Next: invite friends
          </Button>
        }
      >
        <Section title="What counts" />
        <TrackControl value={track} onChange={pickTrack} />

        <Section title="Pick a challenge" />
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {TEMPLATES.map((t) => {
            const locked = Boolean(t.needsWorkouts) && track === 'food'
            const selected = t.id === templateId
            return (
              <Card
                key={t.id}
                tone={selected ? 'pandan' : 'surface'}
                className={cn('w-[48.5%]', locked && 'opacity-50')}
                contentClassName="h-[176px] items-center justify-center gap-1.5 p-4"
                disabled={locked}
                onPress={() => setTemplateId(t.id)}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: locked }}
              >
                <Icon {...t.art} size={64} />
                <Text variant="label" className="text-center">
                  {t.name}
                </Text>
                <Text variant="caption" className="text-center">
                  {locked ? 'Needs Food and workouts' : t.line}
                </Text>
              </Card>
            )
          })}
        </View>

        <Section title="How long" />
        <View className="flex-row gap-2">
          {LENGTHS.map((n) => (
            <Chip key={n} selected={days === n} onPress={() => setDays(n)}>
              {`${n} days`}
            </Chip>
          ))}
        </View>
      </LabScreen>
    )
  }

  if (step === 'invite') {
    return (
      <LabScreen
        header={
          <AppBar
            title="Invite"
            onBack={() => setStep('create')}
            backLabel="Back"
            action={<Text variant="caption">2 of 2</Text>}
          />
        }
        footer={
          <Button
            fullWidth
            disabled={added.length === 0}
            onPress={() => {
              setStep('board')
              toast.show({
                title: `${template.name} has started`,
                description: 'Skipped ahead to day 9 so there is a race to see.',
              })
            }}
          >
            Start challenge
          </Button>
        }
      >
        <Card>
          <View className="flex-row items-center gap-3">
            <View className="h-[64px] w-[64px] items-center justify-center rounded-tile bg-surface-alt">
              <Icon {...template.art} size={48} />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text variant="subtitle">{template.name}</Text>
              <Text variant="meta">
                {days} days · {track === 'food' ? 'Food only' : 'Food and workouts'} · Starts Monday
              </Text>
            </View>
          </View>
        </Card>

        <Card title="Share a code">
          <Text variant="display" className="tracking-[4px]">
            KAKI 4821
          </Text>
          <View className="flex-row gap-2">
            <Button
              size="sm"
              variant="secondary"
              onPress={() => toast.show({ title: 'Code copied' })}
            >
              Copy code
            </Button>
            <Button size="sm" onPress={() => toast.show({ title: 'Share sheet opens here' })}>
              Share link
            </Button>
          </View>
        </Card>

        <Card title="People you follow" contentClassName="gap-0">
          {FAMILY.filter((m) => m.id !== 'you').map((m, index) => {
            const isAdded = added.includes(m.id)
            return (
              <View key={m.id}>
                {index > 0 ? <View className="h-px bg-line" /> : null}
                <View className="flex-row items-center gap-3 py-2.5">
                  <Person who={m} />
                  <Text variant="label" className="flex-1">
                    {m.name}
                  </Text>
                  <Button
                    size="sm"
                    variant={isAdded ? 'secondary' : 'primary'}
                    onPress={() =>
                      setAdded((current) =>
                        isAdded ? current.filter((id) => id !== m.id) : [...current, m.id],
                      )
                    }
                  >
                    {isAdded ? 'Added' : 'Add'}
                  </Button>
                </View>
              </View>
            )
          })}
        </Card>
      </LabScreen>
    )
  }

  if (step === 'recap') {
    const winner = ranked[0]
    const youWon = winner.id === 'you'
    return (
      <LabScreen
        header={<AppBar title="Recap" onBack={() => setStep('board')} backLabel="Back" />}
        footer={
          <View className="gap-1.5">
            <Button
              fullWidth
              onPress={() => {
                setEarned(['breakfast', 'logged'])
                setStep('create')
              }}
            >
              Rematch
            </Button>
            <Button
              variant="ghost"
              fullWidth
              onPress={() => toast.show({ title: 'Recap card shared to the group' })}
            >
              Share recap
            </Button>
          </View>
        }
      >
        <View className="items-center gap-1 pt-2">
          <Icon set="system" name="trophy" size={120} />
          <Text variant="screenTitle" className="text-center">
            {youWon ? `You win ${template.name}` : `${winner.name} wins ${template.name}`}
          </Text>
          <Text variant="meta">{days} days with Family</Text>
        </View>
        <Podium ranked={ranked} points={points} />
        <View className="flex-row gap-3">
          <StatTile label="Meals" value="212" caption="logged" className="flex-1" />
          <StatTile label="Protein" value="104g" caption="team average" className="flex-1" />
          <StatTile label="You" value="11/14" caption="days on target" className="flex-1" />
        </View>
        <Card>
          <View className="flex-row items-center gap-3">
            <Icon set="dishes" name="chicken-rice" size={56} />
            <View className="min-w-0 flex-1">
              <Text variant="meta">Your best day</Text>
              <Text variant="bodyStrong">Thu 16 Oct, 132g protein</Text>
            </View>
          </View>
        </Card>
      </LabScreen>
    )
  }

  return (
    <LabScreen
      header={<AppBar title={template.name} onBack={() => setStep('invite')} backLabel="Back" />}
    >
      <View className="flex-row flex-wrap gap-2">
        <Badge tone="kaya" size="sm">
          {`Day 9 of ${days}`}
        </Badge>
        <Badge tone="neutral" size="sm">
          Family
        </Badge>
        <Badge tone="water" size="sm">
          {`You are #${myRank}`}
        </Badge>
      </View>

      <Podium ranked={ranked} points={points} />

      <Card contentClassName="gap-0 py-3">
        {ranked.slice(3).map((m, index) => (
          <View key={m.id}>
            {index > 0 ? <View className="h-px bg-line" /> : null}
            <View className="flex-row items-center gap-3 py-2">
              <Text variant="label" className="w-5 text-muted">
                {index + 4}
              </Text>
              <Person who={m} />
              <Text variant="label" className="flex-1">
                {m.name}
              </Text>
              <Text variant="meta">{points[m.id]} pts</Text>
            </View>
          </View>
        ))}
      </Card>

      <Section title="Earn more today" />
      <Card contentClassName="gap-0 py-3">
        {earn.map((item, index) => {
          const isDone = earned.includes(item.id)
          return (
            <View key={item.id}>
              {index > 0 ? <View className="h-px bg-line" /> : null}
              <View className="flex-row items-center gap-3 py-2.5">
                <View className="min-w-0 flex-1 gap-1">
                  <Text variant="label">{item.label}</Text>
                  {item.detail && !isDone ? <Text variant="caption">{item.detail}</Text> : null}
                  {item.progress !== undefined && !isDone ? (
                    <Meter value={item.progress} tone="bg-hibiscus" />
                  ) : null}
                </View>
                <Text variant="label" className="text-pandan-ink">
                  +{item.pts}
                </Text>
                <View className="w-[72px] items-end">
                  {isDone ? (
                    <View className="h-7 w-7 items-center justify-center rounded-full bg-pandan">
                      <Icon set="ui" name="check" size={14} tintColor={colors.onPandan} />
                    </View>
                  ) : (
                    <Button size="sm" onPress={() => score(item)}>
                      Do it
                    </Button>
                  )}
                </View>
              </View>
            </View>
          )
        })}
      </Card>

      <Card>
        <View className="flex-row items-center gap-3">
          <Person who={MEMBERS[2]} />
          <Text variant="label" className="min-w-0 flex-1">
            Priya hit her protein goal. +30
          </Text>
          <Chip selected={clapped} onPress={() => setClapped((c) => !c)}>
            {clapped ? 'Clapped' : 'Clap'}
          </Chip>
        </View>
      </Card>

      <PrototypeControls note="Do it stands in for logging the meal or the workout that earns the points.">
        <Button variant="secondary" size="sm" onPress={() => setStep('recap')}>
          Skip to the end
        </Button>
      </PrototypeControls>
    </LabScreen>
  )
}

const PODIUM = [
  { place: 1, height: 96, fill: 'bg-kaya-soft' },
  { place: 0, height: 120, fill: 'bg-pandan-soft' },
  { place: 2, height: 76, fill: 'bg-water-soft' },
] as const

/** Second, first, third, left to right, the way a podium stands. */
function Podium({ ranked, points }: { ranked: readonly Member[]; points: Record<string, number> }) {
  return (
    <Card contentClassName="flex-row items-end gap-2 px-4 pb-0 pt-5">
      {PODIUM.map(({ place, height, fill }) => {
        const m = ranked[place]
        if (!m) return null
        return (
          <View key={place} className="flex-1 items-center gap-1.5">
            {place === 0 ? <Icon set="system" name="crown" size={32} /> : null}
            <Person who={m} size="md" className="self-center" />
            <Text variant="label" numberOfLines={1}>
              {m.name}
            </Text>
            <Text variant="caption">{points[m.id]} pts</Text>
            <View
              className={cn('w-full items-center justify-center rounded-t-[18px]', fill)}
              style={{ height }}
            >
              <Text variant="display">{place + 1}</Text>
            </View>
          </View>
        )
      })}
    </Card>
  )
}
