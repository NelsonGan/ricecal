import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { ScreenTitle } from '@/features/shared/ScreenTitle'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Badge,
  Button,
  CalorieRing,
  Card,
  Chip,
  cn,
  Icon,
  IconButton,
  MacroBar,
  Sheet,
  Text,
  useToast,
} from '@/ui'
import { type Art, DISHES, MEMBERS, type MemberId, type Track } from './data'
import { LabScreen, useLabParams } from './LabScreen'
import { Person, PrototypeControls, Section, useTrackSheet } from './parts'

/**
 * Direction A: the circle shares one daily streak, and it survives only if
 * everyone does their part. The lightest of the four to live with: nothing to
 * set up beyond who is in, and the only action is a nudge.
 */

type Day = { meals: [boolean, boolean, boolean]; moved: boolean }

const TODAY: Record<MemberId, Day> = {
  you: { meals: [true, true, false], moved: true },
  wei: { meals: [true, true, false], moved: true },
  priya: { meals: [true, true, false], moved: true },
  jun: { meals: [true, true, false], moved: true },
  arif: { meals: [false, false, false], moved: false },
}

/** Mon to Sat are settled; Sunday is today and follows the live state. */
type Cell = 'done' | 'freeze' | 'today' | 'missing'
const WEEK: Record<MemberId, Cell[]> = {
  you: ['done', 'done', 'done', 'done', 'done', 'done'],
  wei: ['done', 'freeze', 'done', 'done', 'done', 'done'],
  priya: ['done', 'done', 'done', 'done', 'done', 'done'],
  jun: ['done', 'done', 'done', 'done', 'done', 'done'],
  arif: ['done', 'done', 'done', 'done', 'done', 'done'],
}
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

const NUDGES = [
  'Lunch time! What did you makan?',
  'The streak needs you',
  'Just snap your dinner',
  'You got this',
] as const

const MEAL_LETTERS = ['B', 'L', 'D'] as const

function isIn(day: Day, track: Track) {
  const meals = day.meals.filter(Boolean).length
  return meals >= 2 && (track === 'food' || day.moved)
}

export function StreakCircle() {
  const router = useRouter()
  const colors = useThemeColors()
  const toast = useToast()
  const params = useLabParams()
  const { track, openSettings, sheet } = useTrackSheet(params.track ?? 'both')
  const [view, setView] = useState<'today' | 'circle'>(
    params.step === 'circle' ? 'circle' : 'today',
  )
  const [nudgeOpen, setNudgeOpen] = useState(params.open === 'nudge')
  const [nudge, setNudge] = useState(0)
  const [nudged, setNudged] = useState(false)
  const [arifLogged, setArifLogged] = useState(false)

  const today: Record<MemberId, Day> = arifLogged
    ? { ...TODAY, arif: { meals: [true, true, false], moved: true } }
    : TODAY
  const done = MEMBERS.filter((m) => isIn(today[m.id], track))
  const everyone = done.length === MEMBERS.length
  const streak = everyone ? 13 : 12
  const rule =
    track === 'food' ? 'Everyone logs 2 meals a day' : 'Everyone logs 2 meals and moves once a day'

  const sendNudge = () => {
    setNudgeOpen(false)
    setNudged(true)
    toast.show({ title: 'Nudge sent to Arif', tone: 'success' })
  }

  const arifLogs = () => {
    setArifLogged(true)
    toast.show({
      title: 'Arif logged lunch',
      description: 'Everyone is in. Day 13 is safe.',
      tone: 'success',
    })
  }

  const nudgeSheet = (
    <Sheet
      visible={nudgeOpen}
      onClose={() => setNudgeOpen(false)}
      closeLabel="Close"
      title="Nudge Arif"
      description="The group streak ends in 3h 20m"
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={sendNudge}>
            Send nudge
          </Button>
          <Text variant="caption" className="text-center">
            You can nudge once every 2 hours
          </Text>
        </View>
      }
    >
      <View className="flex-row flex-wrap gap-2">
        {NUDGES.map((text, index) => (
          <Chip key={text} selected={nudge === index} onPress={() => setNudge(index)}>
            {text}
          </Chip>
        ))}
      </View>
      <View className="flex-row items-center gap-3 rounded-tile bg-surface-alt p-3">
        <Icon set="system" name="bell" size={36} />
        <View className="min-w-0 flex-1">
          <Text variant="label">RiceCal</Text>
          <Text variant="meta">
            You: {NUDGES[nudge]} Gym Kakis is on {streak} days.
          </Text>
        </View>
      </View>
    </Sheet>
  )

  if (view === 'today') {
    return (
      <LabScreen
        header={
          <View className="gap-1">
            <AppBar title="A. Streak Circle" onBack={() => router.back()} backLabel="Back" />
          </View>
        }
      >
        <ScreenTitle
          title="Today"
          trailing={
            <Badge tone="kaya">
              <Icon set="body" name="flame-burn" size={18} />
              <Text variant="caption" className="text-kaya-ink">
                6 day streak
              </Text>
            </Badge>
          }
        />
        <Card>
          <View className="flex-row items-center gap-4">
            <CalorieRing
              value={1311}
              goal={2500}
              centerCaption="KCAL LEFT"
              size={128}
              thickness={14}
            />
            <View className="flex-1 gap-3">
              <MacroBar inline label="Carbs" amount="132/244g" value={132 / 244} tone="kaya" />
              <MacroBar inline label="Protein" amount="29/99g" value={29 / 99} tone="hibiscus" />
              <MacroBar inline label="Fat" amount="50/51g" value={50 / 51} tone="teh" />
            </View>
          </View>
        </Card>

        <Card onPress={() => setView('circle')} accessibilityRole="button">
          <View className="flex-row items-start justify-between gap-2">
            <View className="min-w-0 shrink gap-0.5">
              <Text variant="subtitle">Gym Kakis</Text>
              <Text variant="meta">
                {done.length} of {MEMBERS.length} in today
              </Text>
            </View>
            <Badge tone="kaya" size="sm">
              <Icon set="body" name="flame-burn" size={16} />
              <Text variant="caption" className="text-kaya-ink">
                {streak} day group streak
              </Text>
            </Badge>
          </View>
          <View className="flex-row justify-between">
            {MEMBERS.map((m) => {
              const isDone = isIn(today[m.id], track)
              return (
                <View key={m.id} className="items-center gap-1.5">
                  <Person who={m} size="md" done={isDone} className="self-center" />
                  <Text variant="caption" numberOfLines={1}>
                    {m.name.split(' ')[0]}
                  </Text>
                </View>
              )
            })}
          </View>
          {everyone ? null : (
            <View className="flex-row items-center justify-between gap-3 rounded-tile bg-kaya-soft px-4 py-3">
              <Text variant="label" className="min-w-0 shrink text-kaya-ink">
                {nudged ? 'Arif has been nudged' : 'Arif has not logged yet'}
              </Text>
              {nudged ? null : (
                <Button size="sm" onPress={() => setNudgeOpen(true)}>
                  Nudge
                </Button>
              )}
            </View>
          )}
        </Card>

        <Card title="Your day" contentClassName="gap-0">
          <MealRow
            dish={DISHES.charKueyTeow.dish}
            detail="1:00 pm · plate"
            kcal={744}
            art={DISHES.charKueyTeow.art}
          />
          <View className="h-px bg-line" />
          <MealRow
            dish={DISHES.kopiO.dish}
            detail="4:00 pm · cup"
            kcal={58}
            art={DISHES.kopiO.art}
          />
        </Card>
        {nudgeSheet}
      </LabScreen>
    )
  }

  return (
    <LabScreen
      header={
        <AppBar
          title="Gym Kakis"
          onBack={() => setView('today')}
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
      <Card>
        <View className="flex-row items-center gap-4">
          <Icon set="body" name="flame-burn" size={88} />
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="displayLg">{streak}</Text>
            <Text variant="subtitle">day group streak</Text>
            <Text variant="meta">{rule}</Text>
          </View>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {everyone ? (
            <Badge tone="pandan" size="sm">
              Everyone is in for today
            </Badge>
          ) : (
            <Badge tone="kaya" size="sm">
              <Icon set="body" name="alarm" size={16} />
              <Text variant="caption" className="text-kaya-ink">
                Today ends in 3h 20m
              </Text>
            </Badge>
          )}
          <Badge tone="water" size="sm">
            1 freeze left this week
          </Badge>
        </View>
      </Card>

      <Section title="Today" />
      <Card contentClassName="gap-0 py-3">
        {MEMBERS.map((m, index) => {
          const day = today[m.id]
          const isDone = isIn(day, track)
          return (
            <View key={m.id}>
              {index > 0 ? <View className="h-px bg-line" /> : null}
              <View className="flex-row items-center gap-3 py-2.5">
                <Person who={m} size="sm" />
                <Text variant="label" className="min-w-0 flex-1" numberOfLines={1}>
                  {m.name}
                </Text>
                <View className="flex-row gap-1.5">
                  {day.meals.map((logged, meal) => (
                    <View key={MEAL_LETTERS[meal]} className="items-center gap-0.5">
                      <View
                        className={cn('h-4 w-4 rounded-full', logged ? 'bg-pandan' : 'bg-track')}
                      />
                      <Text variant="micro">{MEAL_LETTERS[meal]}</Text>
                    </View>
                  ))}
                </View>
                {track === 'both' ? (
                  <View className={cn('mb-3', day.moved ? undefined : 'opacity-30')}>
                    <Icon set="body" name="dumbbell" size={24} />
                  </View>
                ) : null}
                <View className="w-[96px] items-end">
                  {isDone ? (
                    <View className="h-7 w-7 items-center justify-center rounded-full bg-pandan">
                      <Icon set="ui" name="check" size={14} tintColor={colors.onPandan} />
                    </View>
                  ) : nudged ? (
                    <Badge tone="neutral" size="sm">
                      Nudged
                    </Badge>
                  ) : (
                    <Button size="sm" onPress={() => setNudgeOpen(true)}>
                      Nudge
                    </Button>
                  )}
                </View>
              </View>
            </View>
          )
        })}
      </Card>

      <Section title="This week" />
      <Card>
        <View className="flex-row items-center gap-2">
          <View className="w-[72px]" />
          {WEEKDAYS.map((d, index) => (
            <Text
              // biome-ignore lint/suspicious/noArrayIndexKey: weekday letters repeat
              key={index}
              variant="caption"
              className="flex-1 text-center"
            >
              {d}
            </Text>
          ))}
        </View>
        {MEMBERS.map((m) => {
          const cells: Cell[] = [...WEEK[m.id], isIn(today[m.id], track) ? 'done' : 'today']
          return (
            <View key={m.id} className="flex-row items-center gap-2">
              <Text variant="caption" className="w-[72px] text-ink" numberOfLines={1}>
                {m.name}
              </Text>
              {cells.map((cell, index) => (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: one cell per weekday
                  key={index}
                  className={cn(
                    'h-7 flex-1 rounded-[8px]',
                    cell === 'done' && 'bg-pandan',
                    cell === 'freeze' && 'bg-water',
                    cell === 'today' && 'border-2 border-dashed border-line-strong',
                    cell === 'missing' && 'bg-hibiscus',
                  )}
                />
              ))}
            </View>
          )
        })}
        <View className="flex-row items-center gap-2">
          <View className="h-3 w-3 rounded-[4px] bg-water" />
          <Text variant="caption">Wei Ling used a freeze on Tuesday</Text>
        </View>
      </Card>

      <PrototypeControls note="Group settings (top right) switches between Food only and Food and workouts.">
        <Button variant="secondary" size="sm" disabled={arifLogged} onPress={arifLogs}>
          Arif logs lunch
        </Button>
      </PrototypeControls>

      {nudgeSheet}
      {sheet}
    </LabScreen>
  )
}

function MealRow({
  dish,
  detail,
  kcal,
  art,
}: {
  dish: string
  detail: string
  kcal: number
  art: Art
}) {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <View className="h-[56px] w-[56px] items-center justify-center rounded-tile bg-surface-alt">
        <Icon {...art} size={40} />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="bodyStrong" numberOfLines={1}>
          {dish}
        </Text>
        <Text variant="meta">{detail}</Text>
      </View>
      <Text variant="numeric">{kcal}</Text>
    </View>
  )
}
