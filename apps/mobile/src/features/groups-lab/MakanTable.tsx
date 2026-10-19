import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import {
  AppBar,
  Badge,
  Button,
  Card,
  Chip,
  cn,
  Icon,
  IconButton,
  MacroBar,
  ProgressBar,
  Tappable,
  Text,
  TextField,
  useToast,
} from '@/ui'
import { type Art, DISHES, type Meal, type MemberId, member } from './data'
import { LabScreen, useLabParams } from './LabScreen'
import { Person, Section, useTrackSheet } from './parts'

/**
 * Direction C: the group is a private feed, laid out as today's table. What
 * everyone ate, by meal, with gaps reading "Not yet". Accountability is
 * ambient rather than scored: you see the empty plate, and so do they.
 */

const DINERS = ['you', 'wei', 'arif', 'priya'] as const satisfies readonly MemberId[]
type Diner = (typeof DINERS)[number]

const SLOTS = ['Breakfast', 'Lunch', 'Dinner'] as const

const TABLE: Record<Diner, (Meal | null)[]> = {
  you: [DISHES.kayaToast, DISHES.chickenRice, null],
  wei: [DISHES.rotiCanai, DISHES.charKueyTeow, null],
  arif: [DISHES.nasiLemak, DISHES.laksa, DISHES.bakKutTeh],
  priya: [DISHES.cereal, DISHES.thosai, null],
}

type Move = { name: string; length: string; art: Art }
const MOVED: Record<Diner, Move | null> = {
  you: { name: 'Leg day', length: '1h 5m', art: { set: 'body', name: 'squat' } },
  wei: null,
  arif: { name: 'Badminton', length: '45m', art: { set: 'body', name: 'badminton' } },
  priya: { name: 'Yoga', length: '30m', art: { set: 'body', name: 'yoga-mat' } },
}

const TIMES = ['8:10 am', '1:12 pm', '7:40 pm'] as const

const REACTIONS = ['Shiok', 'Strong', 'Ho jiak'] as const
type Reaction = (typeof REACTIONS)[number]
type Counts = Record<Reaction, number>

type Comment = { who: MemberId; text: string }

const key = (who: Diner, slot: number) => `${who}:${slot}`

const START_COUNTS: Record<string, Counts> = {
  'you:0': { Shiok: 3, Strong: 0, 'Ho jiak': 0 },
  'wei:1': { Shiok: 3, Strong: 2, 'Ho jiak': 1 },
  'arif:2': { Shiok: 2, Strong: 0, 'Ho jiak': 1 },
}

const START_COMMENTS: Record<string, Comment[]> = {
  'wei:1': [
    { who: 'arif', text: 'wah worth it' },
    { who: 'priya', text: 'add more taugeh next time' },
  ],
}

const ZERO: Counts = { Shiok: 0, Strong: 0, 'Ho jiak': 0 }

export function MakanTable() {
  const router = useRouter()
  const toast = useToast()
  const params = useLabParams()
  const { track, openSettings, sheet } = useTrackSheet(params.track ?? 'food')
  const [view, setView] = useState<'table' | 'meal' | 'digest'>(
    params.step === 'meal' || params.step === 'digest' ? params.step : 'table',
  )
  const [open, setOpen] = useState<{ who: Diner; slot: number }>({ who: 'wei', slot: 1 })
  const [mine, setMine] = useState<Record<string, Reaction | undefined>>({})
  const [comments, setComments] = useState(START_COMMENTS)
  const [talk, setTalk] = useState<Comment[]>([
    { who: 'wei', text: 'Who is coming for dinner at the mamak?' },
    { who: 'arif', text: 'Me. Still hitting my protein though' },
  ])
  const [draft, setDraft] = useState('')
  const [clapped, setClapped] = useState(false)

  const countsFor = (k: string): Counts => {
    const base = START_COUNTS[k] ?? ZERO
    const picked = mine[k]
    return picked ? { ...base, [picked]: base[picked] + 1 } : base
  }

  const openMeal = (who: Diner, slot: number) => {
    setOpen({ who, slot })
    setDraft('')
    setView('meal')
  }

  if (view === 'meal') {
    const meal = TABLE[open.who][open.slot]
    if (!meal) return null
    const k = key(open.who, open.slot)
    const counts = countsFor(k)
    const thread = comments[k] ?? []
    const who = member(open.who)
    const title =
      open.who === 'you'
        ? `Your ${SLOTS[open.slot].toLowerCase()}`
        : `${who.name}'s ${SLOTS[open.slot].toLowerCase()}`
    const send = () => {
      const text = draft.trim()
      if (!text) return
      setComments((current) => ({ ...current, [k]: [...(current[k] ?? []), { who: 'you', text }] }))
      setDraft('')
    }

    return (
      <LabScreen
        header={<AppBar title={title} onBack={() => setView('table')} backLabel="Back" />}
        footer={
          <TextField
            placeholder="Comment to the group"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            systemKeyboard
            rightSlot={
              <IconButton size="xs" accessibilityLabel="Send" onPress={send}>
                <Icon set="ui" name="arrow-up" size={18} />
              </IconButton>
            }
          />
        }
      >
        <Card>
          <View className="flex-row items-center gap-3">
            <Person who={who} />
            <Text variant="label" className="flex-1">
              {who.name}
            </Text>
            <Text variant="meta">{TIMES[open.slot]}</Text>
          </View>
          <View className="h-[200px] items-center justify-center rounded-tile bg-surface-alt">
            <Icon {...meal.art} size={150} />
          </View>
          <View className="flex-row items-baseline justify-between">
            <Text variant="subtitle">{meal.dish}</Text>
            <Text variant="numeric">{meal.kcal} kcal</Text>
          </View>
          <MacroBar
            inline
            label="Carbs"
            amount={`${meal.carbs}g`}
            value={meal.carbs / 100}
            tone="kaya"
          />
          <MacroBar
            inline
            label="Protein"
            amount={`${meal.protein}g`}
            value={meal.protein / 50}
            tone="hibiscus"
          />
          <MacroBar inline label="Fat" amount={`${meal.fat}g`} value={meal.fat / 40} tone="teh" />
          <View className="flex-row flex-wrap gap-2">
            {REACTIONS.map((r) => (
              <Chip
                key={r}
                selected={mine[k] === r}
                onPress={() =>
                  setMine((current) => ({ ...current, [k]: current[k] === r ? undefined : r }))
                }
              >
                {counts[r] ? `${r} ${counts[r]}` : r}
              </Chip>
            ))}
          </View>
        </Card>

        <Card title="Only Makan Kakis sees this" contentClassName="gap-0">
          {thread.length === 0 ? (
            <Text variant="meta" className="py-2">
              Nobody has said anything yet.
            </Text>
          ) : (
            thread.map((c, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: comments only append
              <View key={index}>
                {index > 0 ? <View className="h-px bg-line" /> : null}
                <View className="flex-row items-center gap-3 py-2.5">
                  <Person who={member(c.who)} />
                  <View className="min-w-0 flex-1">
                    <Text variant="label">{member(c.who).name}</Text>
                    <Text variant="body">{c.text}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </Card>
      </LabScreen>
    )
  }

  if (view === 'digest') {
    return (
      <LabScreen
        header={
          <AppBar title="Your week together" onBack={() => setView('table')} backLabel="Back" />
        }
        footer={
          <Button fullWidth onPress={() => toast.show({ title: 'Posted to Makan Kakis' })}>
            Share to group
          </Button>
        }
      >
        <Badge tone="neutral" size="sm">
          13 to 19 Oct
        </Badge>
        <Card>
          <View className="flex-row items-baseline gap-2">
            <Text variant="display">87</Text>
            <Text variant="bodyStrong">of 105 meals logged</Text>
          </View>
          <ProgressBar value={87 / 105} />
        </Card>
        <View className="flex-row flex-wrap justify-between gap-y-3">
          <DigestTile
            art={DISHES.chickenRice.art}
            label="Most eaten"
            value="Chicken rice"
            note="9 times"
          />
          <DigestTile
            art={DISHES.ayamPenyet.art}
            label="Most Shiok"
            value="Arif's ayam penyet"
            note="6 reactions"
          />
          <DigestTile
            art={{ set: 'system', name: 'crown' }}
            label="Never missed"
            value="Arif"
            note="7 of 7 days"
          />
          {track === 'both' ? (
            <DigestTile
              art={{ set: 'body', name: 'dumbbell' }}
              label="Moved together"
              value="11 workouts"
              note="Priya did 4"
            />
          ) : (
            <DigestTile
              art={{ set: 'food', name: 'leafy-greens' }}
              label="Veggie MVP"
              value="Priya"
              note="18 servings"
            />
          )}
        </View>
        <Card title="Group calories vs budget">
          <View className="h-[120px] flex-row items-end gap-2">
            {[0.82, 0.64, 0.78, 1.08, 0.8, 0.7, 0.86].map((v, index) => (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: one bar per weekday
                key={index}
                className="flex-1 items-center gap-1"
              >
                <View
                  className={cn('w-full rounded-[8px]', v > 1 ? 'bg-kaya' : 'bg-pandan')}
                  style={{ height: v * 90 }}
                />
                <Text variant="micro">{'MTWTFSS'[index]}</Text>
              </View>
            ))}
          </View>
          <Text variant="caption">Thursday went over: Wei Ling's birthday dinner</Text>
        </Card>
      </LabScreen>
    )
  }

  const moveRow = track === 'both'

  return (
    <LabScreen
      header={
        <AppBar
          title="Makan Kakis"
          onBack={() => router.back()}
          backLabel="Back"
          action={
            <IconButton
              size="sm"
              variant="ghost"
              accessibilityLabel="Group settings"
              onPress={openSettings}
            >
              <Icon set="ui" name="sliders" size={22} />
            </IconButton>
          }
        />
      }
    >
      <View className="flex-row items-center justify-between">
        <Text variant="bodyStrong">Today, Sun 19 Oct</Text>
        <Button size="sm" variant="secondary" onPress={() => setView('digest')}>
          This week
        </Button>
      </View>

      <Card contentClassName="gap-2 p-3">
        <View className="flex-row gap-1.5">
          <View className="w-[62px]" />
          {DINERS.map((d) => (
            <View key={d} className="flex-1 items-center gap-1">
              <Person who={member(d)} className="self-center" />
              <Text variant="caption" numberOfLines={1}>
                {member(d).name.split(' ')[0]}
              </Text>
            </View>
          ))}
        </View>
        {SLOTS.map((slot, s) => (
          <View key={slot} className="flex-row gap-1.5">
            <View className="w-[62px] justify-center">
              <Text variant="caption" className="text-ink">
                {slot}
              </Text>
            </View>
            {DINERS.map((d) => {
              const meal = TABLE[d][s]
              const shiok = countsFor(key(d, s))
              const total = shiok.Shiok + shiok.Strong + shiok['Ho jiak']
              return meal ? (
                <Tappable
                  key={d}
                  onPress={() => openMeal(d, s)}
                  accessibilityRole="button"
                  accessibilityLabel={`${member(d).name}, ${slot}, ${meal.dish}`}
                  className="h-[84px] flex-1 items-center justify-center rounded-[16px] bg-surface-alt"
                >
                  <Icon {...meal.art} size={42} />
                  <Text variant="micro" className="text-muted">
                    {meal.kcal}
                  </Text>
                  {total ? (
                    <View className="absolute right-1 top-1 rounded-full bg-hibiscus-soft px-1.5">
                      <Text variant="micro" className="text-hibiscus-ink">
                        {total}
                      </Text>
                    </View>
                  ) : null}
                </Tappable>
              ) : (
                <View
                  key={d}
                  className="h-[84px] flex-1 items-center justify-center rounded-[16px] border-2 border-dashed border-line"
                >
                  <Text variant="micro">Not yet</Text>
                </View>
              )
            })}
          </View>
        ))}
        {moveRow ? (
          <View className="flex-row gap-1.5">
            <View className="w-[62px] justify-center">
              <Text variant="caption" className="text-ink">
                Moved
              </Text>
            </View>
            {DINERS.map((d) => {
              const move = MOVED[d]
              return move ? (
                <View
                  key={d}
                  className="h-[84px] flex-1 items-center justify-center rounded-[16px] bg-water-soft"
                >
                  <Icon {...move.art} size={38} />
                  <Text variant="micro" className="text-water-ink">
                    {move.length}
                  </Text>
                </View>
              ) : (
                <View
                  key={d}
                  className="h-[84px] flex-1 items-center justify-center rounded-[16px] border-2 border-dashed border-line"
                >
                  <Text variant="micro">Rest day</Text>
                </View>
              )
            })}
          </View>
        ) : null}
      </Card>

      <Card>
        <View className="flex-row items-center gap-3">
          <Icon set="system" name="medal" size={44} />
          <View className="min-w-0 flex-1">
            <Text variant="label">Arif logged all 3 today</Text>
            <Text variant="meta">Complete day, again</Text>
          </View>
          <Chip selected={clapped} onPress={() => setClapped((c) => !c)}>
            {clapped ? 'Clapped' : 'Clap'}
          </Chip>
        </View>
      </Card>

      <Section title="Table talk" />
      <Card contentClassName="gap-0">
        {talk.map((c, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: messages only append
          <View key={index} className="flex-row items-center gap-3 py-2">
            <Person who={member(c.who)} />
            <View className="min-w-0 flex-1">
              <Text variant="label">{member(c.who).name}</Text>
              <Text variant="body">{c.text}</Text>
            </View>
          </View>
        ))}
        <TextField
          placeholder="Say something to the table"
          value={draft}
          onChangeText={setDraft}
          systemKeyboard
          containerClassName="mt-2"
          onSubmitEditing={() => {
            const text = draft.trim()
            if (!text) return
            setTalk((current) => [...current, { who: 'you', text }])
            setDraft('')
          }}
        />
      </Card>
      {sheet}
    </LabScreen>
  )
}

function DigestTile({
  art,
  label,
  value,
  note,
}: {
  art: Art
  label: string
  value: string
  note: string
}) {
  return (
    <Card className="w-[48.5%]" contentClassName="gap-1 p-4">
      <Icon {...art} size={56} />
      <Text variant="caption">{label}</Text>
      <Text variant="label" numberOfLines={2}>
        {value}
      </Text>
      <Text variant="meta">{note}</Text>
    </Card>
  )
}
