import { format } from 'date-fns'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { usePreventRemove } from 'expo-router/react-navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  findAlreadyImported,
  type ImportProgress,
  type ImportResult,
  ImportStopped,
  useSession,
  useSettings,
  useWorkoutImport,
} from '@/data'
import { defaultWorkoutName, Stat, StatGrid, whole } from '@/features/workouts'
import {
  buildImport,
  clearHandedExport,
  handedExport,
  IMPORT_APPS,
  type ImportPlan,
  type ImportUnits,
  type ParsedExport,
  pickExport,
} from '@/features/workouts/import'
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
  useToast,
} from '@/ui'

type Phase =
  // The picker is up: only when the screen was opened without a file, by a
  // link rather than from settings.
  | { step: 'opening' }
  | { step: 'preview'; parsed: ParsedExport }
  | { step: 'importing'; progress: ImportProgress }
  | { step: 'done'; result: ImportResult }
  | { step: 'stopped'; plan: ImportPlan; result: ImportResult }

const APP_NAME = { strong: 'Strong', hevy: 'Hevy' } as const

/**
 * Bring a training history over from Strong or Hevy.
 *
 * The settings row picks the CSV either app exports (`pickExport`) and opens
 * this on it: see what is in it, import. The preview is
 * there because the file decides more than it looks: Strong does not say
 * whether it wrote kilograms or pounds, and a name the catalogue does not
 * know becomes one of the person's own exercises, so both are shown before
 * anything is saved rather than discovered in the history afterwards.
 */
export default function WorkoutImportScreen() {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const toast = useToast()
  const goBack = useBack('/workout/settings')
  // Which app's button was pressed: it names the screen and says where that
  // app keeps its export. The file itself still decides the format, so the
  // other app's export picked by mistake imports all the same.
  const { app: appId } = useLocalSearchParams<{ app?: string }>()
  const app = IMPORT_APPS.find((entry) => entry.id === appId)
  const { userId } = useSession()
  const { data: settings } = useSettings()
  const runImport = useWorkoutImport()
  const [phase, setPhase] = useState<Phase>(() => {
    const parsed = handedExport()
    return parsed ? { step: 'preview', parsed } : { step: 'opening' }
  })
  const [picking, setPicking] = useState(false)
  // A second tap in the same frame, before the phase has changed, started a
  // second run beside the first.
  const running = useRef(false)

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
    () =>
      parsed && userId
        ? buildImport(parsed, chosen, (at) => defaultWorkoutName(t, at), userId)
        : null,
    [parsed, chosen, t, userId],
  )

  // How much of the file is already in the history, asked fresh for each plan
  // rather than cached: the answer goes stale the moment an import lands, and
  // a persisted copy of it showed an old count on the next launch. Unknown
  // (offline, an error) counts as none; the import checks again anyway.
  const [already, setAlready] = useState<{ plan: ImportPlan; ids: Set<string> } | null>(null)
  useEffect(() => {
    if (!plan || !userId) return
    let live = true
    findAlreadyImported(userId, plan)
      .then((ids) => {
        if (live) setAlready({ plan, ids })
      })
      .catch(() => {
        if (live) setAlready({ plan, ids: new Set() })
      })
    return () => {
      live = false
    }
  }, [plan, userId])
  const checked = already && already.plan === plan ? already.ids.size : null
  const fresh = plan ? plan.workouts.length - (checked ?? 0) : 0

  const pick = async () => {
    if (picking) return
    setPicking(true)
    const opening = phase.step === 'opening'
    try {
      const picked = await pickExport()
      // A file that fails while a good one is previewed says so and keeps the
      // preview, rather than throwing away the file that worked. With nothing
      // to keep, it says so on the way back.
      if (picked && 'error' in picked) {
        toast.show({ title: t(`workouts:import.${picked.error}`), tone: 'error' })
      } else if (picked) {
        setUnits(null)
        setPhase({ step: 'preview', parsed: picked.parsed })
        return
      }
      if (opening) goBack()
    } finally {
      setPicking(false)
    }
  }

  // Taken once it is on screen, so a later visit by a link does not open on
  // an old file.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on opening
  useEffect(() => {
    clearHandedExport()
    if (phase.step === 'opening') void pick()
  }, [])

  const start = async (toImport: ImportPlan | null) => {
    if (!toImport?.workouts.length || running.current) return
    running.current = true
    setPhase({ step: 'importing', progress: { done: 0, total: toImport.workouts.length } })
    try {
      const result = await runImport(toImport, (progress) =>
        setPhase({ step: 'importing', progress }),
      )
      track('Workouts Imported', {
        source: toImport.source,
        workouts: result.saved,
        existing: result.existing,
        failed: result.failed,
        custom_exercises: result.created,
      })
      setPhase({ step: 'done', result })
    } catch (failure) {
      const result =
        failure instanceof ImportStopped
          ? failure.result
          : { saved: 0, existing: 0, failed: 0, created: 0 }
      setPhase({ step: 'stopped', plan: toImport, result })
    } finally {
      running.current = false
    }
  }

  const importing = phase.step === 'importing'
  // Leaving mid-import would leave its requests running with nothing to show
  // what landed, and going back in started a second run beside it. The app
  // bar's back is hidden, and this holds the swipe, the Android back button,
  // and the swipe that would close the whole workout stack, which a screen's
  // own `gestureEnabled` does not reach.
  usePreventRemove(importing, () => {})

  const range = (from: string, to: string) => {
    const show = (day: string) => format(new Date(`${day}T00:00:00`), datePattern('dayMonthYear'))
    return from === to ? show(from) : t('workouts:import.range', { from: show(from), to: show(to) })
  }

  return (
    <Screen
      header={
        <AppBar
          title={t(app?.entry ?? 'workouts:import.title')}
          onBack={importing ? undefined : goBack}
          backLabel={t('common:action.back')}
        />
      }
      footer={
        phase.step === 'preview' && plan ? (
          <View className="gap-2">
            <Button
              fullWidth
              onPress={() => start(plan)}
              loading={checked === null}
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
          // Back to the tabs underneath, not a new copy of them on top.
          <Button fullWidth onPress={() => router.dismissTo('/workouts')}>
            {t('common:action.done')}
          </Button>
        ) : phase.step === 'stopped' ? (
          <View className="gap-2">
            <Button fullWidth onPress={() => start(phase.plan)}>
              {t('common:action.retry')}
            </Button>
            <Button fullWidth variant="neutral" onPress={pick} loading={picking}>
              {t('workouts:import.another')}
            </Button>
          </View>
        ) : null
      }
    >
      <Stack.Screen options={{ gestureEnabled: !importing }} />

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
              {checked ? (
                <Text variant="meta">{t('workouts:import.existing', { count: checked })}</Text>
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
                  accessibilityLabel={t('workouts:settings.units')}
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
                  accessibilityLabel={t('workouts:import.distanceUnit')}
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

      {phase.step === 'done' ? <Outcome result={phase.result} /> : null}

      {phase.step === 'stopped' ? (
        <>
          <Alert tone="error" title={t('workouts:import.stopped')} />
          {phase.result.saved ? (
            <Text variant="meta">{t('workouts:import.done', { count: phase.result.saved })}</Text>
          ) : null}
        </>
      ) : null}
    </Screen>
  )
}

/**
 * What an import came to. The trophy only for workouts actually saved: a run
 * that found everything already there, or had every workout refused, read
 * "0 workouts imported" under a trophy.
 */
function Outcome({ result }: { result: ImportResult }) {
  const { t } = useTranslation(['workouts'])
  const lines = (
    <>
      {result.existing ? (
        <Text variant="meta">{t('workouts:import.existing', { count: result.existing })}</Text>
      ) : null}
      {result.failed ? (
        <Text variant="meta">{t('workouts:import.notSaved', { count: result.failed })}</Text>
      ) : null}
    </>
  )
  if (result.saved) {
    return (
      <Card tone="kaya" contentClassName="gap-2">
        <View className="flex-row items-center gap-3">
          <Text variant="title" className="flex-1">
            {t('workouts:import.done', { count: result.saved })}
          </Text>
          <Icon set="system" name="trophy" size={56} />
        </View>
        {lines}
      </Card>
    )
  }
  if (result.failed) {
    return (
      <Alert
        tone="error"
        title={t('workouts:import.notSaved', { count: result.failed })}
        description={
          result.existing ? t('workouts:import.existing', { count: result.existing }) : undefined
        }
      />
    )
  }
  return (
    <Card contentClassName="gap-2">
      <Text variant="subtitle">{t('workouts:import.nothingNew')}</Text>
      {lines}
    </Card>
  )
}
