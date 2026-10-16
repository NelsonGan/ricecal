import { format } from 'date-fns'
import { File } from 'expo-file-system'
import { Stack, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  type ImportProgress,
  type ImportResult,
  useImportOverlap,
  useSettings,
  useWorkoutImport,
} from '@/data'
import {
  buildImport,
  defaultWorkoutName,
  type ImportUnits,
  type ParsedExport,
  parseExport,
  Stat,
  StatGrid,
  whole,
} from '@/features/workouts'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { unitFor } from '@/lib/units'
import {
  Alert,
  AppBar,
  Button,
  Card,
  Icon,
  ProgressBar,
  Screen,
  SegmentedControl,
  Text,
} from '@/ui'

type Phase =
  | { step: 'pick'; error?: 'unknown' | 'empty' | 'failed' }
  | { step: 'preview'; parsed: ParsedExport }
  | { step: 'importing'; progress: ImportProgress }
  | { step: 'done'; result: ImportResult }
  | { step: 'stopped' }

const APP_NAME = { strong: 'Strong', hevy: 'Hevy' } as const

/**
 * Bring a training history over from Strong or Hevy.
 *
 * Pick the CSV either app exports, see what is in it, import. The preview is
 * there because the file decides more than it looks: Strong does not say
 * whether it wrote kilograms or pounds, and a name the catalogue does not
 * know becomes one of the person's own exercises, so both are shown before
 * anything is saved rather than discovered in the history afterwards.
 */
export default function WorkoutImportScreen() {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const goBack = useBack('/workout/settings')
  const { data: settings } = useSettings()
  const runImport = useWorkoutImport()
  const [phase, setPhase] = useState<Phase>({ step: 'pick' })
  const [picking, setPicking] = useState(false)

  const weightUnit = unitFor(settings?.units)
  const [units, setUnits] = useState<ImportUnits | null>(null)
  // Strong writes no units, so the file is read in the account's own until
  // the person says otherwise, which is right for anyone who kept the same
  // units in both apps.
  const chosen = useMemo<ImportUnits>(
    () => units ?? { weight: weightUnit, distance: weightUnit === 'lb' ? 'mi' : 'km' },
    [units, weightUnit],
  )

  const parsed = phase.step === 'preview' ? phase.parsed : null
  const plan = useMemo(
    () => (parsed ? buildImport(parsed, chosen, (at) => defaultWorkoutName(t, at)) : null),
    [parsed, chosen, t],
  )

  const overlap = useImportOverlap(plan)
  // Unknown until the history answers, and treated as none if it cannot
  // (offline): the import checks again before it writes anything.
  const already = overlap.data?.length ?? 0
  const fresh = plan ? plan.workouts.length - already : 0

  const pick = async () => {
    if (picking) return
    setPicking(true)
    try {
      // Every type a CSV turns up as: Android's file providers and anything
      // that passed through Windows label one as Excel's, and a picker
      // filtered to text/csv alone greys the file out.
      const picked = await File.pickFileAsync({
        mimeTypes: [
          'text/csv',
          'text/comma-separated-values',
          'application/csv',
          'application/vnd.ms-excel',
          'text/plain',
        ],
      })
      if (picked.canceled) return
      const result = parseExport(await picked.result.text())
      if ('error' in result) setPhase({ step: 'pick', error: result.error })
      else if (!result.workouts.length) setPhase({ step: 'pick', error: 'empty' })
      else {
        setUnits(null)
        setPhase({ step: 'preview', parsed: result })
      }
    } catch (failure) {
      if ((failure as { code?: string }).code === 'ERR_PICKER_CANCELLED') return
      console.warn('[workouts] import read failed', failure)
      setPhase({ step: 'pick', error: 'failed' })
    } finally {
      setPicking(false)
    }
  }

  const start = async () => {
    if (!plan?.workouts.length) return
    setPhase({ step: 'importing', progress: { done: 0, total: plan.workouts.length } })
    try {
      const result = await runImport(plan, (progress) => setPhase({ step: 'importing', progress }))
      track('Workouts Imported', {
        source: plan.source,
        workouts: result.saved,
        existing: result.existing,
        failed: result.failed,
        custom_exercises: plan.customs.length,
      })
      setPhase({ step: 'done', result })
    } catch (failure) {
      console.warn('[workouts] import failed', failure)
      setPhase({ step: 'stopped' })
    }
  }

  const importing = phase.step === 'importing'
  const range = (from: string, to: string) => {
    const show = (day: string) => format(new Date(`${day}T00:00:00`), datePattern('dayMonthYear'))
    return from === to ? show(from) : t('workouts:import.range', { from: show(from), to: show(to) })
  }

  return (
    <Screen
      header={
        <AppBar
          title={t('workouts:import.title')}
          onBack={importing ? undefined : goBack}
          backLabel={t('common:action.back')}
        />
      }
      footer={
        phase.step === 'preview' && plan ? (
          <View className="gap-2">
            <Button
              fullWidth
              onPress={start}
              loading={overlap.isPending && !overlap.isPaused}
              disabled={fresh === 0}
            >
              {fresh === 0
                ? t('workouts:import.nothingNew')
                : t('workouts:import.import', { count: fresh })}
            </Button>
            <Button fullWidth variant="neutral" onPress={pick} loading={picking}>
              {t('workouts:import.another')}
            </Button>
          </View>
        ) : phase.step === 'done' ? (
          <Button fullWidth onPress={() => router.navigate('/workouts')}>
            {t('common:action.done')}
          </Button>
        ) : phase.step === 'pick' || phase.step === 'stopped' ? (
          <Button fullWidth onPress={pick} loading={picking}>
            {t('workouts:import.choose')}
          </Button>
        ) : null
      }
    >
      {/* Leaving mid-import would orphan the requests still in flight and
          the count of what landed, so the way back is shut until it ends. */}
      <Stack.Screen options={{ gestureEnabled: !importing }} />

      {phase.step === 'pick' ? (
        <>
          <Card contentClassName="flex-row items-center gap-4">
            <Icon set="system" name="sync" size={56} />
            <Text variant="body" className="flex-1">
              {t('workouts:import.intro')}
            </Text>
          </Card>
          {phase.error ? <Alert tone="error" title={t(`workouts:import.${phase.error}`)} /> : null}
        </>
      ) : null}

      {phase.step === 'preview' && plan ? (
        <>
          <Card contentClassName="gap-4">
            <View className="gap-1">
              <Text variant="overline">
                {t('workouts:import.from', { app: APP_NAME[plan.source] })}
              </Text>
              {plan.from && plan.to ? (
                <Text variant="subtitle">{range(plan.from, plan.to)}</Text>
              ) : null}
              {already ? (
                <Text variant="meta">{t('workouts:import.existing', { count: already })}</Text>
              ) : null}
            </View>
            <StatGrid>
              <Stat label={t('workouts:import.workouts')} value={whole(plan.workouts.length)} />
              <Stat label={t('workouts:import.sets')} value={whole(plan.sets)} />
              <Stat
                label={t('workouts:import.exercises')}
                value={whole(plan.matched + plan.customs.length)}
              />
            </StatGrid>
          </Card>

          {phase.parsed.unitless.weight || phase.parsed.unitless.distance ? (
            <Card contentClassName="gap-3">
              <Text variant="bodyStrong">{t('workouts:import.units')}</Text>
              {phase.parsed.unitless.weight ? (
                <SegmentedControl
                  options={[
                    { value: 'kg', label: t('common:unit.kg') },
                    { value: 'lb', label: t('common:unit.lb') },
                  ]}
                  value={chosen.weight}
                  onChange={(weight) => setUnits({ ...chosen, weight })}
                  accessibilityLabel={t('workouts:import.units')}
                />
              ) : null}
              {phase.parsed.unitless.distance ? (
                <SegmentedControl
                  options={[
                    { value: 'km', label: 'km' },
                    { value: 'mi', label: 'mi' },
                  ]}
                  value={chosen.distance}
                  onChange={(distance) => setUnits({ ...chosen, distance })}
                  accessibilityLabel={t('workouts:import.units')}
                />
              ) : null}
            </Card>
          ) : null}

          {plan.customs.length ? (
            <Card contentClassName="gap-1.5">
              <Text variant="bodyStrong">{t('workouts:import.ownExercises')}</Text>
              <Text variant="meta">{plan.customs.map((custom) => custom.name).join(', ')}</Text>
            </Card>
          ) : null}
        </>
      ) : null}

      {phase.step === 'importing' ? (
        <Card contentClassName="gap-3">
          <Text variant="bodyStrong">
            {t('workouts:import.importing', {
              done: whole(phase.progress.done),
              total: whole(phase.progress.total),
            })}
          </Text>
          <ProgressBar
            value={phase.progress.total ? phase.progress.done / phase.progress.total : 0}
            animateOnMount={false}
          />
        </Card>
      ) : null}

      {phase.step === 'done' ? (
        <Card tone="kaya" contentClassName="gap-2">
          <View className="flex-row items-center gap-3">
            <Text variant="title" className="flex-1">
              {t('workouts:import.done', { count: phase.result.saved })}
            </Text>
            <Icon set="system" name="trophy" size={56} />
          </View>
          {phase.result.existing ? (
            <Text variant="meta" className="text-kaya-ink">
              {t('workouts:import.existing', { count: phase.result.existing })}
            </Text>
          ) : null}
          {phase.result.failed ? (
            <Text variant="meta" className="text-kaya-ink">
              {t('workouts:import.notSaved', { count: phase.result.failed })}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {phase.step === 'stopped' ? (
        <Alert tone="error" title={t('workouts:import.stopped')} />
      ) : null}
    </Screen>
  )
}
