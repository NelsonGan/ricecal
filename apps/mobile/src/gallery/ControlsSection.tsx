import { useRef, useState } from 'react'
import type { TextInput } from 'react-native'
import { View } from 'react-native'

import {
  Card,
  Checkbox,
  Divider,
  RadioGroup,
  SearchField,
  SegmentedControl,
  Select,
  Slider,
  Stepper,
  Switch,
  Text,
  TextField,
  Wheel,
} from '@/ui'

const MEALS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
] as const

const SOURCES = [
  { value: 'mamak', label: 'Mamak', description: 'Roti, teh tarik, nasi kandar' },
  { value: 'kopitiam', label: 'Kopitiam', description: 'Kaya toast, kopi, half boiled eggs' },
  { value: 'home', label: 'Home cooked' },
  { value: 'hawker', label: 'Hawker centre' },
] as const

/** A wheel's rows are data, and these are the shape a time picker feeds it. */
const HOURS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}))
const MINUTES = Array.from({ length: 60 }, (_, i) => ({
  value: String(i),
  label: String(i).padStart(2, '0'),
}))

const GOALS = [
  { value: 'lose', label: 'Lose weight' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain muscle', description: 'Higher protein target' },
] as const

export function ControlsSection() {
  const [search, setSearch] = useState('')
  const [hour, setHour] = useState('8')
  const [minute, setMinute] = useState('20')
  const [portion, setPortion] = useState('2 pieces')
  const [invalid, setInvalid] = useState('0')
  const [meal, setMeal] = useState<(typeof MEALS)[number]['value']>('lunch')
  const [source, setSource] = useState<(typeof SOURCES)[number]['value'] | null>('mamak')
  const [goal, setGoal] = useState<(typeof GOALS)[number]['value']>('lose')
  const [reminders, setReminders] = useState(true)
  const [family, setFamily] = useState(false)
  const [halal, setHalal] = useState(true)
  const [seafood, setSeafood] = useState(false)
  const [plates, setPlates] = useState(1.5)
  const [dailyGoal, setDailyGoal] = useState(2100)
  const [kcal, setKcal] = useState('240')

  const portionRef = useRef<TextInput>(null)

  return (
    <>
      <Card title="Text fields">
        <View className="gap-md">
          <SearchField
            value={search}
            onChangeText={setSearch}
            onClear={() => setSearch('')}
            returnKeyType="next"
            onSubmitEditing={() => portionRef.current?.focus()}
          />
          <TextField
            ref={portionRef}
            label="Portion"
            value={portion}
            onChangeText={setPortion}
            hint="Everyday serving units first."
          />
          {/* Both shapes of the app's own number pad, which is what a numeric
              keyboardType opens now. This one takes a decimal point; the one
              under it blanks that key rather than moving 0 off centre. */}
          <TextField
            label="Servings"
            value={invalid}
            onChangeText={setInvalid}
            keyboardType="decimal-pad"
            error={Number(invalid) > 0 ? undefined : 'Portion needs to be more than 0.'}
          />
          <TextField
            label="Calories"
            value={kcal}
            onChangeText={setKcal}
            keyboardType="number-pad"
            selectTextOnFocus
            hint="Whole numbers, and the first key replaces what is there."
          />
          <TextField label="Disabled" value="Locked" editable={false} />
        </View>
      </Card>

      <Card title="Segmented">
        <SegmentedControl
          options={MEALS}
          value={meal}
          onChange={setMeal}
          accessibilityLabel="Meal slot"
        />
        <Text variant="meta" className="mt-2">
          Selected: {meal}
        </Text>
      </Card>

      <Card title="Switches">
        <View className="gap-md">
          <View className="flex-row items-center justify-between gap-4">
            <Text variant="bodyStrong">Meal reminders</Text>
            <Switch
              value={reminders}
              onValueChange={setReminders}
              accessibilityLabel="Meal reminders"
            />
          </View>
          <View className="flex-row items-center justify-between gap-4">
            <Text variant="bodyStrong" className="text-muted">
              Share with family
            </Text>
            <Switch
              value={family}
              onValueChange={setFamily}
              accessibilityLabel="Share with family"
            />
          </View>
        </View>
      </Card>

      <Card title="Choice">
        <RadioGroup options={GOALS} value={goal} onChange={setGoal} />
        <Divider className="my-md" />
        <Checkbox checked={halal} onChange={setHalal} label="Halal only" />
        <Checkbox checked={seafood} onChange={setSeafood} label="No seafood" />
      </Card>

      <Card title="Select">
        <Select
          label="Source"
          options={SOURCES}
          value={source}
          onChange={setSource}
          placeholder="Where did you eat?"
        />
      </Card>

      <Card title="Stepper">
        <Stepper
          value={plates}
          onChange={setPlates}
          unit="plates"
          min={0}
          max={10}
          accessibilityLabel="Portion size"
        />
      </Card>

      <Card title="Slider">
        <Slider
          label="Daily goal"
          value={dailyGoal}
          onChange={setDailyGoal}
          min={1200}
          max={3000}
          step={50}
        />
      </Card>

      {/* Two of them side by side, which is how they are used: a wheel on its
          own is a list, and a row of them is a picker. */}
      <Card title="Wheel">
        <View className="flex-row gap-2">
          <Wheel
            className="flex-1"
            options={HOURS}
            value={hour}
            onChange={setHour}
            accessibilityLabel="Hour"
          />
          <Wheel
            className="flex-1"
            options={MINUTES}
            value={minute}
            onChange={setMinute}
            accessibilityLabel="Minute"
          />
        </View>
      </Card>
    </>
  )
}
