import { FREE_VIDEO_IMPORTS } from '@ricecal/shared'
import * as Linking from 'expo-linking'
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

import {
  useEntitlement,
  useImportRecipe,
  useVideoImportQuota,
  VideoImportError,
  type VideoImportFailure,
  VideoImportLimitError,
} from '@/data'
import { openPaywall, proFeatureTitle, storeSaysPaid } from '@/data/refusals'
import { ImportRing } from '@/features/recipes/ImportRing'
import { PlatformLogo } from '@/features/recipes/PlatformLogo'
import { findVideoLink } from '@/features/recipes/videoLink'
import { useBack } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Button,
  Card,
  EmptyState,
  Icon,
  type IconProps,
  Screen,
  Text,
  useToast,
} from '@/ui'

/** When each stage of the checklist hands over to the next. */
const STAGE_MS = [7000, 20000] as const

/** `limit` is a free account's month spent; `proLimit` is Pro's unprinted ceiling. */
type Failure = VideoImportFailure | 'limit' | 'proLimit'

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
  const { entitled: storeEntitled } = useEntitlement()
  const quota = useVideoImportQuota()
  const [failure, setFailure] = useState<Failure | null>(link ? null : 'unsupported_link')
  const [stage, setStage] = useState(0)

  // Whether this screen is still the one on top, so a recipe that arrives after
  // the user left is announced with a toast rather than by pulling them back.
  // Focus as well as mounting: a screen pushed over this one (a notification,
  // another shared link) leaves it mounted underneath, and replacing the route
  // then would throw away whatever the user had moved on to.
  const focused = useIsFocused()
  const mounted = useRef(true)
  const onTop = useRef(true)
  onTop.current = focused
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Once per link: StrictMode mounts twice, and the share sheet can hand the
  // same screen a second link while it is open. `requestId` invalidates any
  // earlier in-flight import so it cannot overwrite a newer import's UI.
  const started = useRef<string | null>(null)
  const requestId = useRef(0)
  const start = () => {
    if (!link) return
    const currentRequest = ++requestId.current
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
        if (mounted.current && onTop.current && requestId.current === currentRequest) {
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
        if (!mounted.current || requestId.current !== currentRequest) return
        if (error instanceof VideoImportLimitError) {
          // Pro's ceiling is an abuse limit, not something to sell: a paywall
          // for a plan the user already has would be the wrong answer.
          if (error.entitled || quota.data?.entitled) {
            setFailure('proLimit')
            return
          }
          if (storeEntitled || storeSaysPaid()) {
            setFailure('failed')
            if (onTop.current) {
              toast.show({ title: t('paywall:limit.confirming'), tone: 'warning' })
            }
            return
          }
          setFailure('limit')
          if (onTop.current) {
            openPaywall(toast, { title: proFeatureTitle('video_import'), feature: 'video_import' })
          }
          return
        }
        setFailure(error instanceof VideoImportError ? error.code : 'failed')
      })
  }
  const startRef = useRef(start)
  startRef.current = start

  // A free account with nothing left this month is told before anything is
  // sent; the server refuses it anyway, after a round trip. `storeEntitled`
  // overrides a stale free row right after upgrading on `/paywall`.
  const spent = quota.data
    ? !storeEntitled && !quota.data.entitled && quota.data.remaining <= 0
    : false
  // Waits for the allowance only while it is actually being fetched. Offline,
  // the query is paused and would stay pending for good; the import is sent
  // anyway, fails at once, and the screen says the user is offline.
  const waiting = quota.isPending && quota.fetchStatus !== 'paused'
  // biome-ignore lint/correctness/useExhaustiveDependencies: starts once per link, see `started`
  useEffect(() => {
    if (!link) {
      started.current = null
      setFailure('unsupported_link')
      return
    }
    if (started.current === link.url || waiting) return
    if (spent) {
      setFailure('limit')
      return
    }
    start()
  }, [link?.url, waiting, spent])

  // The same video shared again while this screen still shows a failure: the
  // router sees the route it is already on and changes nothing, so without
  // this the old failure stays up and nothing is retried. That is exactly the
  // person who went back to the app and shared it once more. A share that
  // lands while an import is running is the same import, and is left alone.
  const failed = useRef(false)
  failed.current = failure !== null && failure !== 'limit' && failure !== 'proLimit'
  const linkUrl = link?.url ?? null
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const { path, queryParams } = Linking.parse(url)
      const shared = typeof queryParams?.url === 'string' ? findVideoLink(queryParams.url) : null
      if (path?.replace(/^\/+/, '') !== 'recipe/import' || !linkUrl || !failed.current) return
      if (shared?.url === linkUrl) startRef.current()
    })
    return () => subscription.remove()
  }, [linkUrl])

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
  const current = Math.min(stage, stages.length - 1)

  // One moving thing: the ring. The heading names the step it is on, and the
  // list under it is the map of all three, so the rows carry no spinner of
  // their own.
  return (
    <View className="items-center gap-5 pt-4">
      <ImportRing size={152}>
        <PlatformLogo platform={platform} size={76} />
      </ImportRing>

      <View className="items-center gap-1 self-stretch">
        <Animated.View key={current} entering={FadeIn.duration(200)}>
          <Text variant="screenTitle" className="text-center" accessibilityLiveRegion="polite">
            {stages[current]}
          </Text>
        </Animated.View>
        <Text variant="meta" numberOfLines={2} className="text-center">
          {url.replace(/^https?:\/\/(www\.)?/, '')}
        </Text>
      </View>

      <Card
        accessibilityRole="progressbar"
        accessibilityLabel={stages[current]}
        accessibilityState={{ busy: true }}
        className="self-stretch"
        contentClassName="gap-1 p-2"
      >
        {stages.map((label, index) => (
          <StageRow
            key={label}
            label={label}
            state={index < stage ? 'done' : index === current ? 'active' : 'waiting'}
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
      className={`flex-row items-center gap-3 rounded-tile px-3 py-2.5 ${
        state === 'active' ? 'bg-pandan-soft' : ''
      }`}
    >
      <View className="h-6 w-6 items-center justify-center">
        {state === 'done' ? (
          <View className="h-6 w-6 items-center justify-center rounded-full bg-pandan">
            <Icon set="ui" name="check" size={14} tintColor={colors.onPandan} />
          </View>
        ) : state === 'active' ? (
          <View className="h-3.5 w-3.5 rounded-full bg-pandan" />
        ) : (
          <View className="h-5 w-5 rounded-full border-[2.5px] border-line" />
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
  too_long: { set: 'system', name: 'video' },
  proLimit: { set: 'system', name: 'calendar' },
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
  // One way forward each: try again where trying again can work (a platform
  // that would not show a post often does when asked again), the paywall where
  // the month is spent, and another link where this one never will.
  const action =
    failure === 'failed' || failure === 'offline' || failure === 'unreadable' ? (
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
