import { format } from 'date-fns'
import { Directory, File, Paths } from 'expo-file-system'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Platform, Share, View } from 'react-native'

import { fetchWorkoutExport, useSession, useSettings, useUpdateSettings } from '@/data'
import { dateKey } from '@/data/client'
import { ToggleRow } from '@/features/shared'
import {
  RestSheet,
  setWorkoutPrefs,
  shortClock,
  useWorkoutPrefs,
  workoutsCsv,
} from '@/features/workouts'
import { datePattern } from '@/lib/dates'
import { requestWorkoutWrite } from '@/lib/health'
import { parseTime } from '@/lib/meal-times'
import { useBack } from '@/lib/navigation'
import { ensureNotificationPermission } from '@/lib/notifications'
import {
  AppBar,
  Button,
  Card,
  Chip,
  cn,
  Divider,
  ListRow,
  Screen,
  SegmentedControl,
  Sheet,
  Tappable,
  Text,
  useToast,
  Wheel,
  type WheelOption,
} from '@/ui'

/** Monday first, as the streak counts weeks; values are `getDay()` numbers. */
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const

/**
 * Workout settings. The default rest and the reminders follow the account
 * (`user_settings`); Apple Health and keeping the screen on follow the phone
 * (`features/workouts/prefs.ts`).
 */
export default function WorkoutSettingsScreen() {
  const { t } = useTranslation(['workouts', 'common', 'profile'])
  const goBack = useBack('/workouts')
  const router = useRouter()
  const toast = useToast()
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  const prefs = useWorkoutPrefs()
  const [restOpen, setRestOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)
  const { userId } = useSession()

  // A file either way. iOS hands it to the share sheet, which can save, mail
  // or open it in Numbers. React Native's Share carries only text on Android,
  // and a year of sets as text outgrew the intent's size limit and failed, so
  // there the user picks a folder and the file is written into it.
  //
  // The byte order mark is for Excel, which otherwise reads a CSV in the
  // system's code page and garbles a workout named in Thai or Chinese.
  const exportAll = async () => {
    if (!userId || exporting) return
    setExporting(true)
    try {
      const rows = await fetchWorkoutExport(userId)
      if (rows.length === 0) {
        toast.show({ title: t('workouts:settings.exportNone') })
        return
      }
      const csv = `\uFEFF${workoutsCsv(rows)}`
      const name = `ricecal-workouts-${dateKey(new Date())}.csv`
      if (Platform.OS === 'ios') {
        const file = new File(Paths.cache, name)
        file.create({ overwrite: true })
        file.write(csv)
        await Share.share({ url: file.uri })
      } else {
        const folder = await Directory.pickDirectoryAsync()
        const file = folder.createFile(name, 'text/csv')
        file.write(csv)
        toast.show({ title: t('workouts:settings.exportSaved', { name: file.name }) })
      }
    } catch (failure) {
      if ((failure as { code?: string }).code === 'ERR_PICKER_CANCELLED') return
      console.warn('[workouts] export failed', failure)
      toast.show({ title: t('workouts:settings.exportFailed'), tone: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const rest = settings?.workout_rest_s ?? 90
  const days = settings?.workout_reminder_days ?? []
  const at = parseTime(settings?.workout_reminder_at ?? '18:00')
  const atLabel = format(new Date(2026, 0, 1, at.hour, at.minute), datePattern('time'))

  const toggleDay = async (day: number) => {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()
    if (next.length > days.length && !(await ensureNotificationPermission())) {
      toast.show({ title: t('profile:reminders.denied'), tone: 'error' })
      return
    }
    update.mutate({ workout_reminder_days: next })
  }

  const dayLabel = (day: number) =>
    // A fixed Sunday, 4 January 2026, moved forward by the weekday number.
    format(new Date(2026, 0, 4 + day), 'EEE')

  return (
    <Screen
      header={
        <AppBar
          title={t('workouts:settings.title')}
          onBack={goBack}
          backLabel={t('common:action.back')}
        />
      }
    >
      <Card contentClassName="gap-0 px-5 py-1">
        <ListRow
          title={t('workouts:settings.rest')}
          trailing={
            <Text variant="label">
              {rest > 0 ? shortClock(rest) : t('workouts:logger.restOff')}
            </Text>
          }
          onPress={() => setRestOpen(true)}
        />
        <View className="flex-row items-center justify-between gap-3 py-3">
          <Text variant="bodyStrong">{t('workouts:settings.units')}</Text>
          <SegmentedControl
            options={[
              { value: 'metric', label: t('common:unit.kg') },
              { value: 'imperial', label: t('common:unit.lb') },
            ]}
            value={settings?.units}
            onChange={(units) => update.mutate({ units })}
            accessibilityLabel={t('workouts:settings.units')}
            className="w-[140px]"
          />
        </View>
        <Divider />
        <ToggleRow
          title={t('workouts:settings.keepAwake')}
          value={prefs.keepAwake}
          divider={false}
          onValueChange={(keepAwake) => setWorkoutPrefs({ keepAwake })}
        />
        {Platform.OS === 'ios' ? (
          <>
            <Divider />
            <ToggleRow
              title={t('workouts:settings.health')}
              value={prefs.healthWrite}
              divider={false}
              onValueChange={async (on) => {
                if (!on) {
                  setWorkoutPrefs({ healthWrite: false })
                  return
                }
                if (await requestWorkoutWrite()) setWorkoutPrefs({ healthWrite: true })
                else toast.show({ title: t('workouts:settings.healthDenied'), tone: 'error' })
              }}
            />
          </>
        ) : null}
      </Card>

      <Card title={t('workouts:settings.reminders')} contentClassName="gap-4">
        <View className="flex-row flex-wrap gap-2">
          {WEEK.map((day) => (
            <Chip key={day} selected={days.includes(day)} onPress={() => toggleDay(day)}>
              {dayLabel(day)}
            </Chip>
          ))}
        </View>
        <Tappable
          className={cn(
            'flex-row items-center justify-between rounded-md bg-surface-alt px-4 py-3',
            days.length ? undefined : 'opacity-50',
          )}
          onPress={() => setTimeOpen(true)}
          disabled={!days.length}
          accessibilityRole="button"
          accessibilityLabel={t('workouts:settings.reminderTime')}
        >
          <Text variant="bodyStrong">{t('workouts:settings.reminderTime')}</Text>
          <Text variant="label">{atLabel}</Text>
        </Tappable>
      </Card>

      <Card contentClassName="gap-0 px-5 py-1">
        <ListRow
          title={t('workouts:import.entry')}
          onPress={() => router.push('/workout/import')}
        />
        <ListRow
          title={t('workouts:settings.export')}
          trailing={exporting ? <ActivityIndicator /> : undefined}
          onPress={exportAll}
          divider={false}
        />
      </Card>

      <RestSheet
        visible={restOpen}
        onClose={() => setRestOpen(false)}
        title={t('workouts:settings.rest')}
        seconds={rest}
        defaultS={rest}
        onPick={(seconds) => update.mutate({ workout_rest_s: seconds })}
      />

      <TimeSheet
        visible={timeOpen}
        hour={at.hour}
        minute={at.minute}
        onClose={() => setTimeOpen(false)}
        onPick={(hour, minute) =>
          update.mutate({
            workout_reminder_at: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
          })
        }
      />
    </Screen>
  )
}

/** A time of day on wheels, for the reminder. Twenty-four rows of hours, every five minutes. */
function TimeSheet({
  visible,
  hour,
  minute,
  onClose,
  onPick,
}: {
  visible: boolean
  hour: number
  minute: number
  onClose: () => void
  onPick: (hour: number, minute: number) => void
}) {
  const { t } = useTranslation(['workouts', 'common', 'logging'])
  const [h, setH] = useState(hour)
  const [m, setM] = useState(minute - (minute % 5))
  const hours = useMemo<WheelOption[]>(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        value: String(i),
        // The language's own time pattern without its minutes, so the
        // meridiem sits where that language puts it ("6 PM", "PM 6").
        label: format(new Date(2026, 0, 1, i), datePattern('time').replace(':mm', '')),
      })),
    [],
  )
  const minutes = useMemo<WheelOption[]>(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: String(i * 5),
        label: String(i * 5).padStart(2, '0'),
      })),
    [],
  )

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onShow={() => {
        setH(hour)
        setM(minute - (minute % 5))
      }}
      closeLabel={t('common:action.close')}
      title={t('workouts:settings.reminderTime')}
      scrollable={false}
    >
      <View className="gap-5">
        <View className="flex-row gap-2">
          <Wheel
            className="flex-[2]"
            options={hours}
            value={String(h)}
            onChange={(next) => setH(Number(next))}
            accessibilityLabel={t('logging:detail.hour')}
          />
          <Wheel
            className="flex-1"
            options={minutes}
            value={String(m)}
            onChange={(next) => setM(Number(next))}
            accessibilityLabel={t('logging:detail.minute')}
          />
        </View>
        <Button
          fullWidth
          onPress={() => {
            onPick(h, m)
            onClose()
          }}
        >
          {t('common:action.done')}
        </Button>
      </View>
    </Sheet>
  )
}
