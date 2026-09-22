import { formatDistanceToNowStrict } from 'date-fns'
import { Image } from 'expo-image'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, View, type ViewToken } from 'react-native'
import { useAvatarUrl, useMealPhotoUrl, useUserId } from '@/data'
import { toIcon } from '@/data/mappers'
import {
  type SocialAction,
  type SocialKind,
  type SocialPage,
  type SocialPost,
  type SocialProfile,
  type SocialReview,
  useSocialAction,
  useSocialOnline,
  useSocialPhoto,
  useSocialProfile,
} from '@/data/social'
import type { IconRef, ReportReason } from '@/data/types'
import { useBack } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Avatar,
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  Icon,
  IconButton,
  Sheet,
  Spinner,
  Tappable,
  Text,
  useToast,
} from '@/ui'

export function SocialBar({ title, action }: { title: string; action?: ReactNode }) {
  const { t } = useTranslation('social')
  const back = useBack('/feed')
  return <AppBar title={title} onBack={back} backLabel={t('back')} action={action} />
}

export function socialTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatDistanceToNowStrict(date, { addSuffix: true })
}

const minuteListeners = new Set<() => void>()
let minuteTimer: ReturnType<typeof setInterval> | undefined
const minuteSnapshot = () => Math.floor(Date.now() / 60_000)
const subscribeMinute = (listener: () => void) => {
  minuteListeners.add(listener)
  if (!minuteTimer) {
    minuteTimer = setInterval(() => {
      for (const notify of minuteListeners) notify()
    }, 60_000)
  }
  return () => {
    minuteListeners.delete(listener)
    if (!minuteListeners.size && minuteTimer) {
      clearInterval(minuteTimer)
      minuteTimer = undefined
    }
  }
}

/** One shared clock keeps every visible relative time current without a timer per row. */
export function useSocialTime(value: string) {
  useSyncExternalStore(subscribeMinute, minuteSnapshot, minuteSnapshot)
  return socialTime(value)
}

export function useSocialTask() {
  const mutation = useSocialAction()
  const toast = useToast()
  const { t } = useTranslation('social')
  const run = async (input: SocialAction) => {
    try {
      return await mutation.mutateAsync(input)
    } catch (error) {
      toast.show({ title: t('saveFailed'), tone: 'error' })
      throw error
    }
  }
  // Event handlers must consume rejection; sheets can await run to stay open.
  const press = (input: SocialAction) => {
    void run(input).catch(() => undefined)
  }
  return { ...mutation, run, press }
}

type SocialTask = ReturnType<typeof useSocialTask>

export function SocialPhoto({
  path,
  privateUri,
  visible = true,
  avatar = false,
  size = 'sm',
  label,
}: {
  path?: string | null
  privateUri?: string
  visible?: boolean
  avatar?: boolean
  size?: 'sm' | 'md' | 'lg'
  label: string
}) {
  const [focused, setFocused] = useState(false)
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, []),
  )
  const photo = useSocialPhoto(path, visible && focused && !privateUri)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!photo.data) return
    const timer = setTimeout(
      () => tick((value) => value + 1),
      Math.max(0, photo.data.expiresAt - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [photo.data])
  const box = { sm: 40, md: 52, lg: 64 }[size]
  if (visible && privateUri) {
    return (
      <Image
        source={{ uri: privateUri }}
        cachePolicy="none"
        contentFit="cover"
        style={
          avatar
            ? { width: box, height: box, borderRadius: box / 2.8 }
            : { width: '100%', height: '100%' }
        }
        accessibilityLabel={label}
      />
    )
  }
  if (!visible || photo.isError || !photo.data || photo.data.expiresAt <= Date.now()) {
    return avatar ? <Avatar name={label} size={size} fallback="initial" /> : null
  }
  return (
    <Image
      source={{ uri: photo.data.url, headers: photo.data.headers }}
      cachePolicy="none"
      recyclingKey={path ?? undefined}
      contentFit="cover"
      style={
        avatar
          ? { width: box, height: box, borderRadius: box / 2.8 }
          : { width: '100%', height: '100%' }
      }
      accessibilityLabel={label}
    />
  )
}

export function FoodPreview({
  name,
  photo,
  icon,
  visible = true,
  privateUri,
  showName = true,
  compact = false,
  rounded = true,
}: {
  name: string
  photo?: string | null
  icon?: IconRef | null
  visible?: boolean
  privateUri?: string
  showName?: boolean
  compact?: boolean
  rounded?: boolean
}) {
  return (
    <View className={showName ? 'gap-2' : undefined}>
      <View
        className={cn(
          'items-center justify-center overflow-hidden bg-pandan-soft',
          compact ? 'aspect-[2/1]' : 'aspect-square',
          rounded && 'rounded-tile',
        )}
      >
        <View className="absolute items-center justify-center">
          <Icon {...(icon ?? { set: 'food', name: 'cooking-pot' })} size={compact ? 88 : 120} />
        </View>
        {privateUri ? (
          <Image
            source={{ uri: privateUri }}
            cachePolicy="none"
            contentFit="cover"
            style={{ width: '100%', height: '100%' }}
            accessibilityLabel={name}
          />
        ) : photo ? (
          <SocialPhoto path={photo} visible={visible} label={name} />
        ) : null}
      </View>
      {showName ? (
        <Text variant="bodyStrong" numberOfLines={2}>
          {name}
        </Text>
      ) : null}
    </View>
  )
}

export function JoinPrompt() {
  const { t } = useTranslation(['social', 'common'])
  const router = useRouter()
  const colors = useThemeColors()
  const [details, setDetails] = useState(false)
  return (
    <>
      <Card>
        <View className="flex-row items-center gap-2">
          <Text variant="subtitle" className="min-w-0 flex-1">
            {t('join')}
          </Text>
          <IconButton
            size="sm"
            variant="ghost"
            accessibilityLabel={t('shareInfo')}
            onPress={() => setDetails(true)}
          >
            <Icon set="ui" name="info" size={20} tintColor={colors.muted} />
          </IconButton>
        </View>
        <Button size="sm" onPress={() => router.push('/social/edit-profile')}>
          {t('join')}
        </Button>
      </Card>
      <Sheet
        visible={details}
        onClose={() => setDetails(false)}
        closeLabel={t('common:action.close')}
        title={t('join')}
      >
        <Text>{t('joinBody')}</Text>
      </Sheet>
    </>
  )
}

type FollowButtonProps = {
  id: string
  following: boolean
  fullWidth?: boolean
}

function FollowButtonControl({
  id,
  following,
  fullWidth = false,
  own,
  ownPending,
  ownError,
  retryOwn,
  action,
  online,
}: FollowButtonProps & {
  own: SocialProfile | null | undefined
  ownPending: boolean
  ownError: boolean
  retryOwn: () => unknown
  action: SocialTask
  online: boolean
}) {
  const { t } = useTranslation('social')
  const viewer = useUserId()
  const router = useRouter()
  if (id === viewer) return null
  const needsProfile = !following
  const retryProfile = needsProfile && own === undefined && ownError
  const waitingForProfile = needsProfile && (ownPending || (own === undefined && !ownError))
  return (
    <Button
      size="sm"
      variant={following ? 'neutral' : 'secondary'}
      fullWidth={fullWidth}
      disabled={!online || waitingForProfile}
      loading={action.isPending}
      onPress={() => {
        if (!following) {
          if (own === undefined) {
            if (ownError) retryOwn()
            return
          }
          if (own === null || own.review_status !== 'approved' || own.quarantined) {
            router.push(
              own
                ? { pathname: '/social/profile/[id]', params: { id: viewer } }
                : '/social/edit-profile',
            )
            return
          }
        }
        action.press({ action: 'follow', id, following: !following })
      }}
    >
      {t(retryProfile ? 'retry' : following ? 'unfollow' : 'follow')}
    </Button>
  )
}

export function FollowButton(props: FollowButtonProps) {
  const own = useSocialProfile()
  const action = useSocialTask()
  const online = useSocialOnline()
  return (
    <FollowButtonControl
      {...props}
      own={own.data}
      ownPending={own.isPending}
      ownError={own.isError}
      retryOwn={own.refetch}
      action={action}
      online={online}
    />
  )
}

export function PersonRow({
  person,
  visible = true,
  navigable = true,
  trailing,
}: {
  person: SocialProfile
  visible?: boolean
  navigable?: boolean
  trailing?: ReactElement
}) {
  const router = useRouter()
  const { t } = useTranslation('social')
  const name = person.display_name || t('unknownPerson')
  const identity = (
    <>
      <SocialPhoto path={person.avatar_path} visible={visible} avatar label={name} />
      <View className="min-w-0 flex-1">
        <Text variant="label" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="meta" numberOfLines={1}>
          {person.handle ? `@${person.handle}` : ''}
        </Text>
      </View>
    </>
  )
  return (
    <View className="flex-row items-center gap-3 py-3">
      {navigable ? (
        <Tappable
          className="min-h-sm min-w-0 flex-1 flex-row items-center gap-3"
          onPress={() =>
            router.push({ pathname: '/social/profile/[id]', params: { id: person.user_id } })
          }
          accessibilityRole="button"
          accessibilityLabel={[name, person.handle ? `@${person.handle}` : '']
            .filter(Boolean)
            .join(', ')}
        >
          {identity}
        </Tappable>
      ) : (
        <View className="min-h-sm min-w-0 flex-1 flex-row items-center gap-3">{identity}</View>
      )}
      {trailing ?? <FollowButton id={person.user_id} following={person.is_following} />}
    </View>
  )
}

export function ReviewNotice({
  status,
  reason,
  kind,
  id,
}: {
  status: SocialReview
  reason: string | null
  kind: SocialKind
  id: string
}) {
  const { t } = useTranslation(['social', 'common'])
  const action = useSocialTask()
  const online = useSocialOnline()
  const colors = useThemeColors()
  const [details, setDetails] = useState(false)
  if (status === 'approved') return null
  const explanation =
    reason === 'content_not_allowed' || reason === 'Edit the text or photo, then try again.'
      ? t('rejectedBody')
      : reason || t(status === 'rejected' ? 'rejectedBody' : 'pendingBody')
  return (
    <>
      <View className="flex-row flex-wrap items-center gap-2 rounded-md bg-kaya-soft px-3 py-2">
        <Badge tone="kaya" size="sm">
          {t(status)}
        </Badge>
        <IconButton
          size="sm"
          variant="ghost"
          accessibilityLabel={t(status)}
          accessibilityHint={explanation}
          onPress={() => setDetails(true)}
        >
          <Icon set="ui" name="info" size={20} tintColor={colors.muted} />
        </IconButton>
        {status === 'pending' ? (
          <Button
            size="sm"
            variant="neutral"
            disabled={!online}
            loading={action.isPending}
            onPress={() => action.press({ action: 'review', kind, id })}
          >
            {t('retryReview')}
          </Button>
        ) : null}
      </View>
      <Sheet
        visible={details}
        onClose={() => setDetails(false)}
        closeLabel={t('common:action.close')}
        title={t(status)}
      >
        <Text>{explanation}</Text>
      </Sheet>
    </>
  )
}

type ContentSafetyProps = {
  kind: SocialKind
  id: string
  authorId: string
  onRemoved?: () => void
  onBlocked?: () => void
  extraAction?: {
    label: string
    description: string
    input: SocialAction
    disabled?: boolean
  }
}

function ContentSafetyControl({
  kind,
  id,
  authorId,
  onRemoved,
  onBlocked,
  extraAction,
  action,
  online,
}: ContentSafetyProps & { action: SocialTask; online: boolean }) {
  const { t } = useTranslation(['social', 'recipes'])
  const [panel, setPanel] = useState<'menu' | 'report' | 'block' | 'extra' | null>(null)
  const afterDismiss = useRef<(() => void) | null>(null)
  const reasons: ReportReason[] = ['inappropriate', 'spam', 'dangerous', 'stolen']
  const confirming = panel === 'block' || panel === 'extra'
  const confirmLabel = panel === 'extra' && extraAction ? extraAction.label : t('social:block')
  return (
    <>
      <IconButton
        size="sm"
        variant="ghost"
        disabled={!online}
        accessibilityLabel={t('social:options')}
        onPress={() => setPanel('menu')}
      >
        <Icon set="ui" name="more-horizontal" size={22} />
      </IconButton>
      <Sheet
        visible={panel !== null}
        onClose={() => setPanel(null)}
        onDismiss={() => {
          const next = afterDismiss.current
          afterDismiss.current = null
          next?.()
        }}
        dismissible={!action.isPending}
        closeLabel={t('social:cancel')}
        title={
          panel === 'report'
            ? t('social:reportTitle')
            : panel === 'block'
              ? t('social:block')
              : panel === 'extra' && extraAction
                ? extraAction.label
                : t('social:options')
        }
        description={
          panel === 'block'
            ? t('social:blockBody')
            : panel === 'extra'
              ? extraAction?.description
              : undefined
        }
        scrollResetKey={panel ?? 'closed'}
        footer={
          confirming ? (
            <View className="flex-row gap-3">
              <Button
                variant="danger"
                className="flex-1"
                loading={action.isPending}
                disabled={!online || (panel === 'extra' && extraAction?.disabled)}
                onPress={() => {
                  const input =
                    panel === 'block'
                      ? ({ action: 'block', id: authorId } as const)
                      : extraAction?.input
                  if (!input) return
                  afterDismiss.current = () => {
                    void action
                      .run(input)
                      .then(() => {
                        if (panel === 'block') onBlocked?.()
                        onRemoved?.()
                      })
                      .catch(() => undefined)
                  }
                  setPanel(null)
                }}
              >
                {confirmLabel}
              </Button>
              <Button
                variant="neutral"
                className="flex-1"
                disabled={action.isPending}
                onPress={() => setPanel(null)}
              >
                {t('social:cancel')}
              </Button>
            </View>
          ) : undefined
        }
      >
        {panel === 'menu' ? (
          <>
            {extraAction ? (
              <Button
                fullWidth
                variant="ghost"
                contentClassName="justify-start"
                disabled={extraAction.disabled}
                onPress={() => setPanel('extra')}
              >
                {extraAction.label}
              </Button>
            ) : null}
            <Button
              fullWidth
              variant="ghost"
              contentClassName="justify-start"
              disabled={!online}
              onPress={() => setPanel('report')}
            >
              {t('social:report')}
            </Button>
            <Button
              fullWidth
              variant="ghost"
              contentClassName="justify-start"
              disabled={!online}
              onPress={() => setPanel('block')}
            >
              {t('social:block')}
            </Button>
          </>
        ) : panel === 'report' ? (
          reasons.map((reason) => (
            <Button
              key={reason}
              variant="neutral"
              loading={action.isPending}
              disabled={!online}
              onPress={() => {
                afterDismiss.current = () => {
                  void action
                    .run({ action: 'report', kind, id, reason })
                    .then(() => onRemoved?.())
                    .catch(() => undefined)
                }
                setPanel(null)
              }}
            >
              {t(`recipes:report.${reason}`)}
            </Button>
          ))
        ) : null}
      </Sheet>
    </>
  )
}

export function ContentSafety(props: ContentSafetyProps) {
  const action = useSocialTask()
  const online = useSocialOnline()
  return <ContentSafetyControl {...props} action={action} online={online} />
}

export function PostCard({
  post,
  visible = true,
  detail = false,
}: {
  post: SocialPost
  visible?: boolean
  detail?: boolean
}) {
  const { t } = useTranslation('social')
  const viewer = useUserId()
  const ownProfile = useSocialProfile()
  const router = useRouter()
  const leavePost = useCallback(() => router.dismissTo('/feed'), [router])
  const likeAction = useSocialTask()
  const followAction = useSocialTask()
  const menuAction = useSocialTask()
  const online = useSocialOnline()
  const [panel, setPanel] = useState<'options' | 'delete' | null>(null)
  const afterDismiss = useRef<(() => void) | null>(null)
  const mine = post.author_id === viewer
  const own = ownProfile.data
  const privatePhoto =
    mine && (post.review_status !== 'approved' || post.quarantined)
      ? (post.photo_path ?? undefined)
      : undefined
  const ownPhoto = useMealPhotoUrl(privatePhoto)
  const ownAvatar = useAvatarUrl(mine ? (post.avatar_path ?? undefined) : undefined)
  const open = () => router.push({ pathname: '/social/post/[id]', params: { id: post.id } })
  const time = useSocialTime(post.published_at ?? post.created_at)
  const hasPhoto = Boolean(post.photo_path || ownPhoto.data)
  const toggleLike = () => {
    if (!post.is_liked) {
      if (own === undefined) return
      if (own === null || own.review_status !== 'approved' || own.quarantined) {
        router.push(
          own
            ? { pathname: '/social/profile/[id]', params: { id: viewer } }
            : '/social/edit-profile',
        )
        return
      }
    }
    likeAction.press({ action: 'like', id: post.id, liked: !post.is_liked })
  }
  return (
    <View className="overflow-hidden border-b-2 border-track bg-surface">
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Tappable
          className="min-h-sm min-w-0 flex-1 flex-row items-center gap-3"
          onPress={() =>
            router.push({ pathname: '/social/profile/[id]', params: { id: post.author_id } })
          }
          accessibilityRole="button"
          accessibilityLabel={[post.display_name, `@${post.handle}`, time]
            .filter(Boolean)
            .join(', ')}
        >
          <SocialPhoto
            path={mine ? null : post.avatar_path}
            privateUri={ownAvatar.data}
            visible={visible}
            avatar
            label={post.display_name}
          />
          <View className="min-w-0 flex-1">
            <Text variant="label" numberOfLines={1}>
              {post.display_name}
            </Text>
            <Text variant="meta" numberOfLines={1}>
              {[`@${post.handle}`, time].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Tappable>
        {!mine && !post.is_following ? (
          <FollowButtonControl
            id={post.author_id}
            following={false}
            own={ownProfile.data}
            ownPending={ownProfile.isPending}
            ownError={ownProfile.isError}
            retryOwn={ownProfile.refetch}
            action={followAction}
            online={online}
          />
        ) : null}
        {mine ? (
          <IconButton
            size="sm"
            variant="ghost"
            accessibilityLabel={t('options')}
            onPress={() => setPanel('options')}
          >
            <Icon set="ui" name="more-horizontal" size={22} />
          </IconButton>
        ) : (
          <ContentSafetyControl
            kind="post"
            id={post.id}
            authorId={post.author_id}
            onRemoved={detail ? leavePost : undefined}
            action={menuAction}
            online={online}
          />
        )}
      </View>
      {detail ? (
        <View>
          <FoodPreview
            name={post.food_name}
            photo={privatePhoto ? null : post.photo_path}
            icon={toIcon(post.icon_set, post.icon_name)}
            visible={visible}
            privateUri={ownPhoto.data}
            showName={false}
            compact={!hasPhoto}
            rounded={false}
          />
        </View>
      ) : (
        <Tappable onPress={open} accessibilityRole="button" accessibilityLabel={post.food_name}>
          <FoodPreview
            name={post.food_name}
            photo={privatePhoto ? null : post.photo_path}
            icon={toIcon(post.icon_set, post.icon_name)}
            visible={visible}
            privateUri={ownPhoto.data}
            showName={false}
            compact={!hasPhoto}
            rounded={false}
          />
        </Tappable>
      )}
      <View className="gap-2 px-5 pb-4 pt-2">
        <View className="flex-row items-center gap-5">
          <Tappable
            className="min-h-sm min-w-[44px] flex-row items-center justify-center gap-1.5"
            disabled={
              !online ||
              post.review_status !== 'approved' ||
              likeAction.isPending ||
              (!post.is_liked && ownProfile.data === undefined)
            }
            accessibilityRole="button"
            accessibilityLabel={`${t(post.is_liked ? 'unlike' : 'like')}, ${t('likes', { count: post.like_count })}`}
            accessibilityState={{
              disabled:
                !online ||
                post.review_status !== 'approved' ||
                likeAction.isPending ||
                (!post.is_liked && ownProfile.data === undefined),
              selected: post.is_liked,
            }}
            onPress={toggleLike}
          >
            <Icon set="system" name={post.is_liked ? 'heart-filled' : 'heart'} size={24} />
            <Text variant="meta">{post.like_count}</Text>
          </Tappable>
          {detail ? (
            <View
              className="min-h-sm min-w-[44px] flex-row items-center justify-center gap-1.5"
              accessible
              accessibilityLabel={t('comments', { count: post.comment_count })}
            >
              <Icon set="system" name="chat" size={24} />
              <Text variant="meta">{post.comment_count}</Text>
            </View>
          ) : (
            <Tappable
              className="min-h-sm min-w-[44px] flex-row items-center justify-center gap-1.5"
              accessibilityRole="button"
              accessibilityLabel={t('comments', { count: post.comment_count })}
              onPress={open}
            >
              <Icon set="system" name="chat" size={24} />
              <Text variant="meta">{post.comment_count}</Text>
            </Tappable>
          )}
        </View>
        <Text variant="bodyStrong" numberOfLines={2}>
          {post.food_name}
        </Text>
        {post.caption ? <Text numberOfLines={detail ? undefined : 2}>{post.caption}</Text> : null}
        {post.audience === 'followers' ? (
          <View className="flex-row items-center gap-1.5">
            <Icon set="system" name="lock" size={17} />
            <Text variant="meta">{t('followersOnly')}</Text>
          </View>
        ) : null}
        {mine ? (
          <ReviewNotice
            status={post.quarantined ? 'quarantined' : post.review_status}
            reason={post.review_reason}
            kind="post"
            id={post.id}
          />
        ) : null}
      </View>
      <Sheet
        visible={panel !== null}
        onClose={() => setPanel(null)}
        onDismiss={() => {
          const next = afterDismiss.current
          afterDismiss.current = null
          next?.()
        }}
        dismissible={!menuAction.isPending}
        closeLabel={t('cancel')}
        title={t(panel === 'delete' ? 'deletePost' : 'options')}
        description={panel === 'delete' ? t('deletePostBody') : undefined}
        scrollResetKey={panel ?? 'closed'}
        footer={
          panel === 'delete' ? (
            <View className="flex-row gap-3">
              <Button
                variant="danger"
                className="flex-1"
                loading={menuAction.isPending}
                disabled={!online}
                onPress={() => {
                  afterDismiss.current = () => {
                    void menuAction
                      .run({ action: 'deletePost', id: post.id })
                      .then(() => {
                        if (detail) leavePost()
                      })
                      .catch(() => undefined)
                  }
                  setPanel(null)
                }}
              >
                {t('deletePost')}
              </Button>
              <Button
                variant="neutral"
                className="flex-1"
                disabled={menuAction.isPending}
                onPress={() => setPanel(null)}
              >
                {t('cancel')}
              </Button>
            </View>
          ) : undefined
        }
      >
        {panel === 'options' ? (
          <>
            <Button
              fullWidth
              variant="ghost"
              contentClassName="justify-start"
              onPress={() => {
                afterDismiss.current = () =>
                  router.push({ pathname: '/social/compose', params: { postId: post.id } })
                setPanel(null)
              }}
            >
              {t('editPost')}
            </Button>
            <Button
              fullWidth
              variant="ghost"
              contentClassName="justify-start"
              disabled={!online}
              onPress={() => setPanel('delete')}
            >
              {t('deletePost')}
            </Button>
          </>
        ) : null}
      </Sheet>
    </View>
  )
}

export function PostTile({ post, visible = true }: { post: SocialPost; visible?: boolean }) {
  const { t } = useTranslation('social')
  const viewer = useUserId()
  const router = useRouter()
  const mine = post.author_id === viewer
  const status = post.quarantined ? 'quarantined' : post.review_status
  const privatePhoto = mine && status !== 'approved' ? (post.photo_path ?? undefined) : undefined
  const ownPhoto = useMealPhotoUrl(privatePhoto)
  return (
    <Tappable
      className="flex-1 overflow-hidden rounded-md bg-surface p-1"
      accessibilityRole="button"
      accessibilityLabel={[post.food_name, mine && status !== 'approved' ? t(status) : '']
        .filter(Boolean)
        .join(', ')}
      onPress={() => router.push({ pathname: '/social/post/[id]', params: { id: post.id } })}
    >
      <FoodPreview
        name={post.food_name}
        photo={privatePhoto ? null : post.photo_path}
        icon={toIcon(post.icon_set, post.icon_name)}
        visible={visible}
        privateUri={ownPhoto.data}
      />
      {mine && status !== 'approved' ? (
        <Badge className="absolute left-3 top-3" tone="kaya" size="sm">
          {t(status)}
        </Badge>
      ) : null}
    </Tappable>
  )
}

type PageQuery<T> = {
  data?: { pages: SocialPage<T>[] }
  isPending: boolean
  isError: boolean
  isFetching: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  hasNextPage: boolean
  fetchStatus: string
  fetchNextPage: () => Promise<unknown>
  refetch: () => Promise<unknown>
}
export function SocialList<T>({
  query,
  rowKey,
  renderRow,
  empty,
  header,
  variant = 'cards',
  columns = 1,
}: {
  query: PageQuery<T>
  rowKey: (row: T) => string
  renderRow: (row: T, visible: boolean) => ReactElement
  empty: string
  header?: ReactElement
  variant?: 'cards' | 'feed' | 'rows' | 'grid'
  columns?: number
}) {
  const { t } = useTranslation('social')
  const [visible, setVisible] = useState<Set<string>>(new Set())
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<T>[] }) =>
    setVisible(new Set(viewableItems.map((item) => item.key))),
  ).current
  const seen = new Set<string>()
  const rows = (query.data?.pages.flatMap((page) => page.rows) ?? []).filter((row) => {
    const id = rowKey(row)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  const next = () => {
    if (query.hasNextPage && !query.isFetching) void query.fetchNextPage()
  }
  const contentContainerStyle =
    variant === 'feed'
      ? { paddingBottom: 32 }
      : variant === 'rows'
        ? { paddingHorizontal: 20, paddingBottom: 32 }
        : variant === 'grid'
          ? { padding: 2, paddingBottom: 32 }
          : { padding: 20, gap: 16, paddingBottom: 32 }
  return (
    <FlatList
      data={rows}
      keyExtractor={rowKey}
      renderItem={({ item }) => {
        const row = renderRow(item, visible.has(rowKey(item)))
        return variant === 'grid' ? (
          <View style={{ flex: 1 / columns }} className="p-0.5">
            {row}
          </View>
        ) : (
          row
        )
      }}
      numColumns={columns}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 5 }}
      contentContainerStyle={contentContainerStyle}
      style={{ flex: 1 }}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={
        header ? { marginBottom: variant === 'feed' ? 0 : variant === 'grid' ? 12 : 16 } : undefined
      }
      ItemSeparatorComponent={
        variant === 'rows' ? () => <View className="h-[2px] bg-track" /> : undefined
      }
      keyboardShouldPersistTaps="handled"
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={5}
      refreshing={query.isFetching && !query.isFetchingNextPage}
      onRefresh={() => {
        void query.refetch()
      }}
      onEndReached={next}
      onEndReachedThreshold={0.6}
      ListEmptyComponent={
        query.isPending && query.fetchStatus !== 'paused' ? (
          <Spinner label={t('loading')} />
        ) : (
          <EmptyState
            title={
              query.fetchStatus === 'paused' ? t('offline') : query.isError ? t('failed') : empty
            }
          />
        )
      }
      ListFooterComponent={
        query.isFetchNextPageError && rows.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => {
              void query.fetchNextPage()
            }}
          >
            {t('retry')}
          </Button>
        ) : query.isError && rows.length === 0 ? (
          <Button
            variant="neutral"
            onPress={() => {
              void query.refetch()
            }}
          >
            {t('retry')}
          </Button>
        ) : query.isFetchingNextPage ? (
          <Spinner label={t('loading')} />
        ) : query.hasNextPage ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => {
              void query.fetchNextPage()
            }}
          >
            {t('loadMore')}
          </Button>
        ) : null
      }
      ListFooterComponentStyle={{ padding: 16 }}
    />
  )
}

export function QueryNotice({
  pending,
  error,
  paused,
  unavailable,
  retry,
}: {
  pending?: boolean
  error?: boolean
  paused?: boolean
  unavailable?: boolean
  retry: () => unknown
}) {
  const { t } = useTranslation('social')
  if (pending && !paused) return <Spinner label={t('loading')} />
  return (
    <View className="gap-3">
      <EmptyState
        title={
          paused
            ? t('offline')
            : error
              ? t('failed')
              : unavailable
                ? t('unavailable')
                : t('emptyPosts')
        }
      />
      {error ? (
        <Button
          variant="neutral"
          onPress={() => {
            retry()
          }}
        >
          {t('retry')}
        </Button>
      ) : null}
    </View>
  )
}
