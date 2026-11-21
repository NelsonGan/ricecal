import { FREE_VIDEO_IMPORTS } from '@ricecal/shared'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  useImportRecipe,
  useVideoImportQuota,
  VideoImportError,
  type VideoImportFailure,
  VideoImportLimitError,
} from '@/data'
import { openPaywall, proFeatureTitle } from '@/data/refusals'
import { findVideoLink } from '@/features/recipes/videoLink'
import { useBack } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  type IconProps,
  Screen,
  Spinner,
  Text,
  useToast,
} from '@/ui'

/** When each stage of the checklist hands over to the next. */
const STAGE_MS = [7000, 20000] as const

type Failure = VideoImportFailure | 'limit'

/**
 * A cooking video becoming a recipe: `/recipe/import?url=…`.
 *
 * Reached two ways, and both land here with the link: Import on the Recipes
 * tab's sheet, and the system share sheet, whose extension opens
 * `ricecal:///recipe/import?url=…` (README: "Importing a recipe from a video").
 *
 * The import starts as soon as the screen does, because both ways in were the
 * user saying "import this". It runs on the server and takes ten to forty
 * seconds, most of it a model watching the video, so the screen shows the link
 * it is working on and three stages that advance on a timer: honest theatre,
 * as `ReadingRecipe` is, since the client cannot watch the call. The recipe is
 * written on the server, so leaving does not lose it, and the screen says so.
 *
 * On success it is replaced by the recipe itself. A failure stays here and says
 * which one, with the one thing that can be done about it.
 */
export default function ImportRecipeScreen() {
  const { t } = useTranslation(['recipes', 'common', 'paywall'])
  const router = useRouter()
  const toast = useToast()
  const goBack = useBack('/recipes')
  const params = useLocalSearchParams<{ url?: string | string[] }>()
  const raw = Array.isArray(params.url) ? params.url[0] : params.url
  const link = findVideoLink(raw)

  const importRecipe = useImportRecipe()
  const quota = useVideoImportQuota()
  const [failure, setFailure] = useState<Failure | null>(link ? null : 'unsupported_link')
  const [stage, setStage] = useState(0)

  // Whether this screen is still the one on top, so a recipe that arrives after
  // the user left is announced with a toast rather than by pulling them back.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Once per link: StrictMode mounts twice, and the share sheet can hand the
  // same screen a second link while it is open.
  const started = useRef<string | null>(null)
  const start = () => {
    if (!link) return
    started.current = link.url
    setFailure(null)
    setStage(0)
    importRecipe
      .mutateAsync(link.url)
      .then((result) => {
        const title = result.existing
          ? t('recipes:import.doneExisting')
          : result.community
            ? t('recipes:import.doneCommunity')
            : t('recipes:import.done')
        if (mounted.current) {
          toast.show({ title, tone: 'success' })
          router.replace({ pathname: '/recipe/[id]', params: { id: result.recipeId } })
        } else {
          toast.show({
            title: t('recipes:import.readyAway'),
            tone: 'success',
            action: {
              label: t('recipes:import.open'),
              onPress: () =>
                router.push({ pathname: '/recipe/[id]', params: { id: result.recipeId } }),
            },
          })
        }
      })
      .catch((error: unknown) => {
        if (error instanceof VideoImportLimitError) {
          if (mounted.current) setFailure('limit')
          openPaywall(toast, { title: proFeatureTitle('video_import'), feature: 'video_import' })
          return
        }
        if (!mounted.current) return
        setFailure(error instanceof VideoImportError ? error.code : 'failed')
      })
  }

  // A free account with nothing left this month is told before anything is
  // sent; the server refuses it anyway, after a round trip.
  const spent = quota.data ? !quota.data.entitled && quota.data.remaining <= 0 : false
  // biome-ignore lint/correctness/useExhaustiveDependencies: starts once per link, see `started`
  useEffect(() => {
    if (!link || started.current === link.url || quota.isPending) return
    if (spent) {
      started.current = link.url
      setFailure('limit')
      return
    }
    start()
  }, [link?.url, quota.isPending, spent])

  useEffect(() => {
    if (failure || !importRecipe.isPending) return
    const timers = STAGE_MS.map((ms, index) => setTimeout(() => setStage(index + 1), ms))
    return () => timers.forEach(clearTimeout)
  }, [failure, importRecipe.isPending])

  const working = !failure

  return (
    <Screen
      header={
        <AppBar
          title={working ? t('recipes:import.screenTitle') : ''}
          onBack={() => goBack()}
          backLabel={t('common:a11y.back')}
        />
      }
    >
      {working && link ? (
        <Working platform={link.platform} url={link.url} stage={stage} />
      ) : (
        <FailureState
          failure={failure ?? 'failed'}
          limit={quota.data?.limit}
          onRetry={start}
          onOtherLink={() => goBack()}
          onPro={() =>
            openPaywall(toast, { title: proFeatureTitle('video_import'), feature: 'video_import' })
          }
        />
      )}
    </Screen>
  )
}

function Working({
  platform,
  url,
  stage,
}: {
  platform: NonNullable<ReturnType<typeof findVideoLink>>['platform']
  url: string
  stage: number
}) {
  const { t } = useTranslation('recipes')
  const stages = [t('import.step.watch'), t('import.step.write'), t('import.step.count')]

  return (
    <View className="gap-5">
      <Card>
        <View className="flex-row items-center gap-4">
          <Icon set="system" name="video" size={64} />
          <View className="min-w-0 flex-1 gap-1.5">
            <Badge tone="pandan" size="sm" className="self-start">
              {t(`platform.${platform}`)}
            </Badge>
            <Text variant="body" numberOfLines={2} className="text-muted">
              {url.replace(/^https?:\/\/(www\.)?/, '')}
            </Text>
          </View>
        </View>
      </Card>

      <Card
        accessibilityRole="progressbar"
        accessibilityLabel={stages[Math.min(stage, stages.length - 1)]}
        accessibilityState={{ busy: true }}
        contentClassName="gap-1 p-2"
      >
        {stages.map((label, index) => (
          <StageRow
            key={label}
            label={label}
            state={index < stage ? 'done' : index === stage ? 'active' : 'waiting'}
          />
        ))}
      </Card>

      <Text variant="meta" className="text-center">
        {t('import.leave')}
      </Text>
    </View>
  )
}

function StageRow({ label, state }: { label: string; state: 'done' | 'active' | 'waiting' }) {
  const colors = useThemeColors()
  return (
    <View
      className={`flex-row items-center gap-3 rounded-tile px-3 py-3 ${
        state === 'active' ? 'bg-pandan-soft' : ''
      }`}
    >
      <View className="h-7 w-7 items-center justify-center">
        {state === 'done' ? (
          <View className="h-7 w-7 items-center justify-center rounded-full bg-pandan">
            <Icon set="ui" name="check" size={16} tintColor={colors.onPandan} />
          </View>
        ) : state === 'active' ? (
          <Spinner />
        ) : (
          <View className="h-6 w-6 rounded-full border-[3px] border-line" />
        )}
      </View>
      <Text variant="bodyStrong" className={state === 'waiting' ? 'text-muted' : undefined}>
        {label}
      </Text>
    </View>
  )
}

const FAILURE_ICONS: Record<Failure, IconProps> = {
  not_recipe: { set: 'food', name: 'cooking-pot' },
  unreadable: { set: 'ui', name: 'unlink' },
  unsupported_link: { set: 'ui', name: 'unlink' },
  failed: { set: 'ui', name: 'warning' },
  busy: { set: 'system', name: 'clock' },
  offline: { set: 'ui', name: 'offline' },
  limit: { set: 'system', name: 'crown' },
}

function FailureState({
  failure,
  limit,
  onRetry,
  onOtherLink,
  onPro,
}: {
  failure: Failure
  limit?: number
  onRetry: () => void
  onOtherLink: () => void
  onPro: () => void
}) {
  const { t } = useTranslation('recipes')
  // One way forward each: try again where trying again can work, the paywall
  // where the month is spent, and another link where this one never will.
  const action =
    failure === 'failed' || failure === 'offline' ? (
      <Button onPress={onRetry}>{t('import.tryAgain')}</Button>
    ) : failure === 'limit' ? (
      <Button onPress={onPro}>{t('import.seePro')}</Button>
    ) : (
      <Button variant="secondary" onPress={onOtherLink}>
        {t('import.otherLink')}
      </Button>
    )

  return (
    <EmptyState
      icon={FAILURE_ICONS[failure]}
      title={t(`import.failure.${failure}.title`)}
      description={t(`import.failure.${failure}.body`, { count: limit ?? FREE_VIDEO_IMPORTS })}
      action={action}
    />
  )
}
