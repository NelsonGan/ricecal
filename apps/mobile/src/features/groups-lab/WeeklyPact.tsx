import { useRouter } from 'expo-router'
import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import {
  AppBar,
  Badge,
  type BadgeTone,
  Button,
  CalorieRing,
  Card,
  Chip,
  Icon,
  Stepper,
  Text,
  TextField,
  useToast,
} from '@/ui'
import { MEMBERS, type MemberId, type Track } from './data'
import { LabScreen, useLabParams } from './LabScreen'
import { Meter, Person, PrototypeControls, Section } from './parts'

/**
 * Direction D: the group agrees a weekly pact, everyone works towards it, and
 * Sunday closes the week. Cooperative with a little bite (the stake), and the
 * weekly rhythm forgives a bad Tuesday in a way a daily streak cannot.
 */

type Progress = { logged: number; budget: number; moved: number }

/** Where everyone stands on Friday of week 6, two days left. */
const FRIDAY: Record<MemberId, Progress> = {
  you: { logged: 5, budget: 4, moved: 3 },
  wei: { logged: 5, budget: 4, moved: 3 },
  priya: { logged: 4, budget: 2, moved: 3 },
  jun: { logged: 3, budget: 3, moved: 1 },
  arif: { logged: 2, budget: 1, moved: 0 },
}
const NONE: Progress = { logged: 0, budget: 0, moved: 0 }

type Stake = 'kopi' | 'fun' | 'custom'
const STAKES: readonly { value: Stake; label: string }[] = [
  { value: 'kopi', label: 'Loser buys kopi' },
  { value: 'fun', label: 'Just for fun' },
  { value: 'custom', label: 'Custom' },
]

type Target = { key: keyof Progress; label: string; target: number; tone: string }

const MOODS = ['Strong', 'Okay', 'Struggled', 'Holiday'] as const

const STEPS = ['create', 'invite', 'week', 'checkin'] as const
type Step = (typeof STEPS)[number]

export function WeeklyPact() {
  const router = useRouter()
  const toast = useToast()
  const params = useLabParams()
  const [step, setStep] = useState<Step>(STEPS.find((s) => s === params.step) ?? 'create')
  const [name, setName] = useState('Lunch Kakis')
  const [track, setTrack] = useState<Track>(params.track ?? 'food')
  const [logDays, setLogDays] = useState(5)
  const [budgetDays, setBudgetDays] = useState(4)
  const [workouts, setWorkouts] = useState(3)
  const [stake, setStake] = useState<Stake>('kopi')
  const [week, setWeek] = useState(6)
  const [cheered, setCheered] = useState<MemberId[]>([])
  const [settled, setSettled] = useState<'paid' | 'forgiven' | null>(null)
  const [mood, setMood] = useState<(typeof MOODS)[number]>('Strong')
  const [same, setSame] = useState(true)

  const fresh = week > 6
  const daysLeft = fresh ? 7 : 2

  const targets: readonly Target[] = [
    { key: 'logged', label: 'Logged', target: logDays, tone: 'bg-pandan' },
    { key: 'budget', label: 'In budget', target: budgetDays, tone: 'bg-kaya' },
    ...(track === 'both'
      ? [{ key: 'moved', label: 'Worked out', target: workouts, tone: 'bg-water' } as const]
      : []),
  ]

  const progressOf = (id: MemberId) => (fresh ? NONE : FRIDAY[id])

  const statusOf = (id: MemberId): { label: string; tone: BadgeTone } => {
    if (fresh) return { label: 'New week', tone: 'neutral' }
    const p = progressOf(id)
    const deficit = Math.max(...targets.map((t) => Math.max(0, t.target - p[t.key])))
    if (deficit === 0) return { label: 'Done', tone: 'pandan' }
    if (deficit > daysLeft) return { label: 'Behind', tone: 'hibiscus' }
    return { label: deficit === 1 ? '1 more day' : `${deficit} more days`, tone: 'kaya' }
  }

  const share =
    MEMBERS.reduce((sum, m) => {
      const p = progressOf(m.id)
      const parts = targets.map((t) => Math.min(1, p[t.key] / t.target))
      return sum + parts.reduce((a, b) => a + b, 0) / parts.length
    }, 0) / MEMBERS.length
  const statuses = MEMBERS.map((m) => statusOf(m.id))
  const doneCount = statuses.filter((s) => s.label === 'Done').length
  const behindCount = statuses.filter((s) => s.label === 'Behind').length

  const cheer = (id: MemberId) => {
    setCheered((current) => [...current, id])
    const who = MEMBERS.find((m) => m.id === id)
    toast.show({ title: `Cheer sent to ${who?.name ?? 'them'}`, tone: 'success' })
  }

  if (step === 'create') {
    return (
      <LabScreen
        header={<AppBar title="Make a pact" onBack={() => router.back()} backLabel="Back" />}
        footer={
          <Button fullWidth disabled={!name.trim()} onPress={() => setStep('invite')}>
            Create and invite
          </Button>
        }
      >
        <TextField label="Group name" value={name} onChangeText={setName} systemKeyboard />

        <Section title="What do we track?" />
        <View className="flex-row gap-3">
          <TrackCard
            selected={track === 'food'}
            label="Food only"
            onPress={() => setTrack('food')}
            art="food"
          />
          <TrackCard
            selected={track === 'both'}
            label="Food and workouts"
            onPress={() => setTrack('both')}
            art="both"
          />
        </View>

        <Section title="Each week, everyone" />
        <Card contentClassName="gap-0">
          <PactRow label="Logs food on">
            <Stepper
              value={logDays}
              onChange={setLogDays}
              min={1}
              max={7}
              unit="days"
              decrementLabel="Fewer days"
              incrementLabel="More days"
            />
          </PactRow>
          <View className="h-px bg-line" />
          <PactRow label="Stays in budget on">
            <Stepper
              value={budgetDays}
              onChange={setBudgetDays}
              min={0}
              max={7}
              unit="days"
              decrementLabel="Fewer days"
              incrementLabel="More days"
            />
          </PactRow>
          {track === 'both' ? (
            <>
              <View className="h-px bg-line" />
              <PactRow label="Works out">
                <Stepper
                  value={workouts}
                  onChange={setWorkouts}
                  min={1}
                  max={7}
                  unit="times"
                  decrementLabel="Fewer workouts"
                  incrementLabel="More workouts"
                />
              </PactRow>
            </>
          ) : null}
        </Card>

        <Section title="Stakes" />
        <View className="flex-row flex-wrap gap-2">
          {STAKES.map((s) => (
            <Chip
              key={s.value}
              selected={stake === s.value}
              onPress={() => setStake(s.value)}
              leftIcon={
                s.value === 'kopi' ? <Icon set="dishes" name="kopi-o" size={22} /> : undefined
              }
            >
              {s.label}
            </Chip>
          ))}
        </View>

        <Card tone="water">
          <Text variant="label" className="text-water-ink">
            Friends see days logged and calories
          </Text>
          <Text variant="meta" className="text-water-ink">
            Never your weight. Each member can hide calories when they join.
          </Text>
        </Card>
      </LabScreen>
    )
  }

  if (step === 'invite') {
    return (
      <LabScreen
        header={<AppBar title="Invite" onBack={() => setStep('create')} backLabel="Back" />}
        footer={
          <Button fullWidth onPress={() => setStep('week')}>
            Start the week
          </Button>
        }
      >
        <View className="items-center gap-2 pt-2">
          <Icon set="system" name="users-group" size={96} />
          <Text variant="screenTitle" className="text-center">
            {name.trim()} is ready
          </Text>
          <Text variant="meta" className="text-center">
            The first week starts when two of you are in.
          </Text>
        </View>
        <Card title="Share a code">
          <Text variant="display" className="tracking-[4px]">
            LUNCH 77
          </Text>
          <Button size="sm" onPress={() => toast.show({ title: 'Share sheet opens here' })}>
            Share link
          </Button>
        </Card>
        <Card title="Who is in" contentClassName="gap-0">
          {MEMBERS.slice(1).map((m, index) => (
            <View key={m.id}>
              {index > 0 ? <View className="h-px bg-line" /> : null}
              <View className="flex-row items-center gap-3 py-2.5">
                <Person who={m} />
                <Text variant="label" className="flex-1">
                  {m.name}
                </Text>
                <Badge tone={m.id === 'jun' ? 'neutral' : 'pandan'} size="sm">
                  {m.id === 'jun' ? 'Invited' : 'Joined'}
                </Badge>
              </View>
            </View>
          ))}
        </Card>
      </LabScreen>
    )
  }

  if (step === 'checkin') {
    const kept = MEMBERS.filter((m) => m.id !== 'arif')
    return (
      <LabScreen
        header={
          <AppBar title={`Week ${week} check-in`} onBack={() => setStep('week')} backLabel="Back" />
        }
        footer={
          <Button
            fullWidth
            onPress={() => {
              setWeek((w) => w + 1)
              setCheered([])
              setSettled(null)
              setStep(same ? 'week' : 'create')
            }}
          >
            {same ? `Start week ${week + 1}` : 'Change the pact'}
          </Button>
        }
      >
        <View className="items-center gap-1 pt-2">
          <Icon set="system" name="medal" size={110} />
          <Text variant="screenTitle" className="text-center">
            Pact kept by {kept.length} of {MEMBERS.length}
          </Text>
          <Text variant="meta">{week} week pact streak for the group</Text>
        </View>
        <Card>
          <View className="flex-row justify-between">
            {MEMBERS.map((m) => (
              <View key={m.id} className="items-center gap-1">
                <Person who={m} size="md" done={m.id !== 'arif'} className="self-center" />
                <Text variant="caption">{m.name.split(' ')[0]}</Text>
              </View>
            ))}
          </View>
        </Card>

        {stake === 'kopi' ? (
          <Card tone={settled ? 'pandan' : 'kaya'}>
            <View className="flex-row items-center gap-3">
              <Icon set="dishes" name="kopi-o" size={56} />
              <View className="min-w-0 flex-1">
                <Text variant="subtitle">
                  {settled === 'paid'
                    ? 'Arif paid up'
                    : settled === 'forgiven'
                      ? 'Arif is forgiven'
                      : 'Arif owes kopi'}
                </Text>
                <Text variant="meta">
                  {settled ? 'Settled for this week' : 'Missed in budget by 3 days'}
                </Text>
              </View>
            </View>
            {settled ? null : (
              <View className="flex-row gap-2">
                <Button size="sm" onPress={() => setSettled('paid')}>
                  Mark as paid
                </Button>
                <Button size="sm" variant="neutral" onPress={() => setSettled('forgiven')}>
                  Forgive
                </Button>
              </View>
            )}
          </Card>
        ) : (
          <Card>
            <Text variant="label">Arif missed it this week</Text>
            <Text variant="meta">No stakes, so a cheer goes out for next week instead.</Text>
          </Card>
        )}

        <Card title="How was your week?">
          <View className="flex-row flex-wrap gap-2">
            {MOODS.map((m) => (
              <Chip key={m} selected={mood === m} onPress={() => setMood(m)}>
                {m}
              </Chip>
            ))}
          </View>
        </Card>

        <Card title="Next week">
          <View className="flex-row gap-2">
            <Chip selected={same} onPress={() => setSame(true)}>
              Same pact
            </Chip>
            <Chip selected={!same} onPress={() => setSame(false)}>
              Change pact
            </Chip>
          </View>
        </Card>
      </LabScreen>
    )
  }

  return (
    <LabScreen
      header={
        <AppBar
          title={name.trim() || 'Lunch Kakis'}
          onBack={() => router.back()}
          backLabel="Back"
        />
      }
      footer={
        <Button
          fullWidth
          onPress={() => toast.show({ title: 'Cheer sent to everyone', tone: 'success' })}
        >
          Cheer the team
        </Button>
      }
    >
      <Text variant="meta">
        {fresh ? `Week ${week}, 7 days to go` : `Week ${week}, Friday. ${daysLeft} days left`}
      </Text>
      <Card>
        <View className="flex-row items-center gap-4">
          <CalorieRing
            value={Math.round(share * 100)}
            goal={100}
            centerLabel={`${Math.round(share * 100)}%`}
            centerCaption="TEAM PACT"
            size={124}
            thickness={14}
            tone="pandan"
          />
          <View className="min-w-0 flex-1 gap-2">
            <Text variant="subtitle">Team pact</Text>
            <Text variant="meta">
              {fresh ? 'Everyone starts at zero' : `${doneCount} done, ${behindCount} behind`}
            </Text>
            {stake === 'kopi' ? (
              <Badge tone="kaya" size="sm">
                <Icon set="dishes" name="kopi-o" size={18} />
                <Text variant="caption" className="text-kaya-ink">
                  Loser buys kopi
                </Text>
              </Badge>
            ) : null}
          </View>
        </View>
      </Card>

      <Section title="Everyone" />
      <Card contentClassName="gap-0 py-3">
        {MEMBERS.map((m, index) => {
          const p = progressOf(m.id)
          const status = statusOf(m.id)
          const canCheer = status.tone === 'hibiscus' || status.tone === 'kaya'
          return (
            <View key={m.id}>
              {index > 0 ? <View className="h-px bg-line" /> : null}
              <View className="flex-row items-center gap-3 py-3">
                <Person who={m} />
                <View className="min-w-0 flex-1 gap-1.5">
                  <Text variant="label">{m.name}</Text>
                  {targets.map((t) => (
                    <View key={t.key} className="flex-row items-center gap-2">
                      <Meter value={p[t.key] / t.target} tone={t.tone} className="flex-1" />
                      <Text variant="micro" className="w-[86px] text-muted">
                        {`${t.label} ${p[t.key]}/${t.target}`}
                      </Text>
                    </View>
                  ))}
                </View>
                <View className="w-[96px] items-end gap-1.5">
                  <Badge tone={status.tone} size="sm">
                    {status.label}
                  </Badge>
                  {canCheer && m.id !== 'you' ? (
                    cheered.includes(m.id) ? (
                      <Text variant="caption">Cheered</Text>
                    ) : (
                      <Button size="sm" variant="secondary" onPress={() => cheer(m.id)}>
                        Cheer
                      </Button>
                    )
                  ) : null}
                </View>
              </View>
            </View>
          )
        })}
      </Card>

      <PrototypeControls note="The bars follow the pact: go back and change the steppers to see who falls behind.">
        <Button variant="secondary" size="sm" onPress={() => setStep('checkin')}>
          Skip to Sunday
        </Button>
      </PrototypeControls>
    </LabScreen>
  )
}

function PactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-2.5">
      <Text variant="label" className="min-w-0 shrink">
        {label}
      </Text>
      {children}
    </View>
  )
}

function TrackCard({
  selected,
  label,
  art,
  onPress,
}: {
  selected: boolean
  label: string
  art: 'food' | 'both'
  onPress: () => void
}) {
  return (
    <Card
      tone={selected ? 'pandan' : 'surface'}
      className="flex-1"
      contentClassName="h-[150px] items-center justify-center gap-2 p-4"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View className="flex-row items-center">
        <Icon set="dishes" name="nasi-lemak" size={52} />
        {art === 'both' ? <Icon set="body" name="dumbbell" size={44} className="-ml-3" /> : null}
      </View>
      <Text variant="label" className="text-center">
        {label}
      </Text>
    </Card>
  )
}
