import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { useThemeColors } from '@/theme/useTheme'
import { Avatar, type AvatarSize, Card, cn, Icon, SegmentedControl, Sheet, Text } from '@/ui'
import { type Member, TRACK_OPTIONS, type Track } from './data'
import { useLabParams } from './LabScreen'

/** A person in a group: always a letter, never the stock figure. */
export function Person({
  who,
  size = 'sm',
  done,
  className,
}: {
  who: Member
  size?: AvatarSize
  /** Draws a tick on the corner when they have done today's part. */
  done?: boolean
  className?: string
}) {
  const colors = useThemeColors()
  return (
    <View className={cn('self-start', className)}>
      <Avatar name={who.name} tone={who.tone} fallback="initial" size={size} />
      {done ? (
        <View className="absolute -bottom-1 -right-1 h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-surface bg-pandan">
          <Icon set="ui" name="check" size={12} tintColor={colors.onPandan} />
        </View>
      ) : null}
    </View>
  )
}

/** A row of people, overlapping like `AvatarGroup` but with their own tones. */
export function People({ who, size = 'sm' }: { who: readonly Member[]; size?: AvatarSize }) {
  return (
    <View className="flex-row items-center">
      {who.map((m, index) => (
        <View key={m.id} style={index > 0 ? { marginLeft: -10 } : undefined}>
          <Avatar name={m.name} tone={m.tone} fallback="initial" size={size} />
        </View>
      ))}
    </View>
  )
}

/** A heading between cards. */
export function Section({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <View className="mt-1 flex-row items-center justify-between">
      <Text variant="subtitle">{title}</Text>
      {trailing}
    </View>
  )
}

/** The choice every group makes once: food alone, or food and workouts. */
export function TrackControl({
  value,
  onChange,
}: {
  value: Track
  onChange: (value: Track) => void
}) {
  return (
    <SegmentedControl
      options={TRACK_OPTIONS}
      value={value}
      onChange={onChange}
      accessibilityLabel="What the group tracks"
    />
  )
}

/**
 * Group settings, reduced to the one switch the prototypes need: flipping a
 * group between food only and food plus workouts, to see what each costs the
 * screen.
 */
export function useTrackSheet(initial: Track) {
  const [track, setTrack] = useState<Track>(initial)
  const [open, setOpen] = useState(false)
  const sheet = (
    <Sheet
      visible={open}
      onClose={() => setOpen(false)}
      closeLabel="Close"
      title="Group settings"
      description="Changes what everyone in the group is held to from tomorrow."
    >
      <TrackControl
        value={track}
        onChange={(next) => {
          setTrack(next)
          setOpen(false)
        }}
      />
    </Sheet>
  )
  return { track, openSettings: () => setOpen(true), sheet }
}

/** A thin bar, for progress that is not worth a whole `ProgressBar` row. */
export function Meter({
  value,
  tone = 'bg-pandan',
  className,
}: {
  value: number
  tone?: string
  className?: string
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <View className={cn('h-2 overflow-hidden rounded-full bg-track', className)}>
      <View className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
    </View>
  )
}

/**
 * Buttons that stand in for something happening elsewhere, like a friend
 * logging lunch. Left out of captures, which are meant to read as the product.
 */
export function PrototypeControls({ note, children }: { note: string; children: ReactNode }) {
  const { capture } = useLabParams()
  if (capture) return null
  return (
    <Card tone="kaya">
      <Text variant="overline" className="text-kaya-ink">
        Prototype controls
      </Text>
      <Text variant="meta" className="text-kaya-ink">
        {note}
      </Text>
      {children}
    </Card>
  )
}
