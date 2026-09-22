import { Image } from 'expo-image'
import { useFocusEffect, useRouter } from 'expo-router'
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, View, type ViewToken } from 'react-native'
import { useMealPhotoUrl, useUserId } from '@/data'
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
import {
  AppBar,
  Avatar,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Icon,
  Sheet,
  Spinner,
  Tappable,
  Text,
  useToast,
} from '@/ui'

export function SocialBar({ title }: { title: string }) {
  const { t } = useTranslation('social')
  const back = useBack('/feed')
  return <AppBar title={title} onBack={back} backLabel={t('back')} />
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

export function SocialPhoto({
  path,
  visible = true,
  avatar = false,
  label,
}: {
  path?: string | null
  visible?: boolean
  avatar?: boolean
  label: string
}) {
  const [focused, setFocused] = useState(false)
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, []),
  )
  const photo = useSocialPhoto(path, visible && focused)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!photo.data) return
    const timer = setTimeout(
      () => tick((value) => value + 1),
      Math.max(0, photo.data.expiresAt - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [photo.data])
  if (!focused || !visible || photo.isError || !photo.data || photo.data.expiresAt <= Date.now()) {
    return avatar ? <Avatar name={label} size="sm" /> : null
  }
  return (
    <Image
      source={{ uri: photo.data.url, headers: photo.data.headers }}
      cachePolicy="none"
      recyclingKey={path ?? undefined}
      contentFit="cover"
      style={
        avatar ? { width: 44, height: 44, borderRadius: 22 } : { width: '100%', height: '100%' }
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
}: {
  name: string
  photo?: string | null
  icon?: IconRef | null
  visible?: boolean
  privateUri?: string
}) {
  return (
    <View className="gap-3">
      <View className="aspect-square items-center justify-center overflow-hidden rounded-tile bg-pandan-soft">
        <View className="absolute items-center justify-center">
          <Icon {...(icon ?? { set: 'food', name: 'cooking-pot' })} size={120} />
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
      <Text variant="subtitle">{name}</Text>
    </View>
  )
}

export function JoinPrompt() {
  const { t } = useTranslation('social')
  const router = useRouter()
  return (
    <Card>
      <Text variant="subtitle">{t('join')}</Text>
      <Text>{t('joinBody')}</Text>
      <Button onPress={() => router.push('/social/edit-profile')}>{t('join')}</Button>
    </Card>
  )
}

export function FollowButton({ id, following }: { id: string; following: boolean }) {
  const { t } = useTranslation('social')
  const viewer = useUserId()
  const own = useSocialProfile()
  const router = useRouter()
  const action = useSocialTask()
  const online = useSocialOnline()
  if (id === viewer) return null
  return (
    <Button
      size="sm"
      variant={following ? 'neutral' : 'secondary'}
      disabled={!online}
      loading={action.isPending}
      onPress={() => {
        if (!following && (own.data?.review_status !== 'approved' || own.data.quarantined)) {
          router.push(
            own.data
              ? { pathname: '/social/profile/[id]', params: { id: viewer } }
              : '/social/edit-profile',
          )
          return
        }
        action.press({ action: 'follow', id, following: !following })
      }}
    >
      {t(following ? 'unfollow' : 'follow')}
    </Button>
  )
}

export function PersonRow({
  person,
  visible = true,
  trailing,
}: {
  person: SocialProfile
  visible?: boolean
  trailing?: ReactElement
}) {
  const router = useRouter()
  const { t } = useTranslation('social')
  const name = person.display_name || t('unknownPerson')
  return (
    <View className="flex-row items-center gap-3 py-3">
      <Tappable
        className="min-w-0 flex-1 flex-row items-center gap-3"
        onPress={() =>
          router.push({ pathname: '/social/profile/[id]', params: { id: person.user_id } })
        }
        accessibilityLabel={name}
      >
        <SocialPhoto path={person.avatar_path} visible={visible} avatar label={name} />
        <View className="min-w-0 flex-1">
          <Text variant="label" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="meta" numberOfLines={1}>
            {person.handle ? `@${person.handle}` : ''}
          </Text>
        </View>
      </Tappable>
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
  const { t } = useTranslation('social')
  const action = useSocialTask()
  const online = useSocialOnline()
  if (status === 'approved') return null
  const explanation =
    reason === 'content_not_allowed' || reason === 'Edit the text or photo, then try again.'
      ? t('rejectedBody')
      : reason || t(status === 'rejected' ? 'rejectedBody' : 'pendingBody')
  return (
    <View className="gap-2 rounded-md bg-kaya-soft p-3">
      <Text variant="label">{t(status)}</Text>
      <Text variant="meta">{explanation}</Text>
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
  )
}

export function ContentSafety({
  kind,
  id,
  authorId,
  onRemoved,
}: {
  kind: SocialKind
  id: string
  authorId: string
  onRemoved?: () => void
}) {
  const { t } = useTranslation(['social', 'recipes'])
  const [report, setReport] = useState(false)
  const [block, setBlock] = useState(false)
  const action = useSocialTask()
  const online = useSocialOnline()
  const reasons: ReportReason[] = ['inappropriate', 'spam', 'dangerous', 'stolen']
  return (
    <>
      <View className="flex-row flex-wrap gap-2">
        <Button size="sm" variant="ghost" disabled={!online} onPress={() => setReport(true)}>
          {t('social:report')}
        </Button>
        <Button size="sm" variant="ghost" disabled={!online} onPress={() => setBlock(true)}>
          {t('social:block')}
        </Button>
      </View>
      <Sheet
        visible={report}
        onClose={() => setReport(false)}
        closeLabel={t('social:cancel')}
        title={t('social:reportTitle')}
      >
        {reasons.map((reason) => (
          <Button
            key={reason}
            variant="neutral"
            loading={action.isPending}
            disabled={!online}
            onPress={() => {
              void action
                .run({ action: 'report', kind, id, reason })
                .then(() => {
                  setReport(false)
                  onRemoved?.()
                })
                .catch(() => undefined)
            }}
          >
            {t(`recipes:report.${reason}`)}
          </Button>
        ))}
      </Sheet>
      <ConfirmSheet
        visible={block}
        onClose={() => setBlock(false)}
        title={t('social:block')}
        description={t('social:blockBody')}
        confirmLabel={t('social:block')}
        cancelLabel={t('social:cancel')}
        onConfirm={async () => {
          await action.run({ action: 'block', id: authorId })
          onRemoved?.()
        }}
      />
    </>
  )
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
  const action = useSocialTask()
  const online = useSocialOnline()
  const [remove, setRemove] = useState(false)
  const mine = post.author_id === viewer
  const ownPhoto = useMealPhotoUrl(
    mine && post.review_status !== 'approved' ? (post.photo_path ?? undefined) : undefined,
  )
  const open = () => router.push({ pathname: '/social/post/[id]', params: { id: post.id } })
  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <Tappable
          className="min-w-0 flex-1 flex-row items-center gap-3"
          onPress={() =>
            router.push({ pathname: '/social/profile/[id]', params: { id: post.author_id } })
          }
          accessibilityLabel={post.display_name}
        >
          <SocialPhoto path={post.avatar_path} visible={visible} avatar label={post.display_name} />
          <View className="min-w-0 flex-1">
            <Text variant="label" numberOfLines={1}>
              {post.display_name}
            </Text>
            <Text variant="meta">@{post.handle}</Text>
          </View>
        </Tappable>
        {!mine ? <FollowButton id={post.author_id} following={post.is_following} /> : null}
      </View>
      <Tappable
        onPress={detail ? undefined : open}
        disabled={detail}
        accessibilityLabel={post.food_name}
      >
        <FoodPreview
          name={post.food_name}
          photo={post.photo_path}
          icon={toIcon(post.icon_set, post.icon_name)}
          visible={visible}
          privateUri={ownPhoto.data}
        />
      </Tappable>
      {post.caption ? <Text>{post.caption}</Text> : null}
      <Text variant="meta">{t(post.audience === 'followers' ? 'followersOnly' : 'everyone')}</Text>
      {mine ? (
        <ReviewNotice
          status={post.quarantined ? 'quarantined' : post.review_status}
          reason={post.review_reason}
          kind="post"
          id={post.id}
        />
      ) : null}
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={post.is_liked ? 'secondary' : 'ghost'}
          disabled={!online || post.review_status !== 'approved'}
          loading={action.isPending}
          accessibilityLabel={t(post.is_liked ? 'unlike' : 'like')}
          onPress={() => {
            if (
              !post.is_liked &&
              (ownProfile.data?.review_status !== 'approved' || ownProfile.data.quarantined)
            ) {
              router.push(
                ownProfile.data
                  ? { pathname: '/social/profile/[id]', params: { id: viewer } }
                  : '/social/edit-profile',
              )
              return
            }
            action.press({ action: 'like', id: post.id, liked: !post.is_liked })
          }}
        >
          {t('likes', { count: post.like_count })}
        </Button>
        <Button size="sm" variant="ghost" onPress={detail ? undefined : open} disabled={detail}>
          {t('comments', { count: post.comment_count })}
        </Button>
      </View>
      {detail ? (
        mine ? (
          <View className="flex-row flex-wrap gap-2">
            <Button
              size="sm"
              variant="neutral"
              onPress={() =>
                router.push({ pathname: '/social/compose', params: { postId: post.id } })
              }
            >
              {t('editPost')}
            </Button>
            <Button size="sm" variant="ghost" disabled={!online} onPress={() => setRemove(true)}>
              {t('deletePost')}
            </Button>
          </View>
        ) : (
          <ContentSafety
            kind="post"
            id={post.id}
            authorId={post.author_id}
            onRemoved={() => router.replace('/feed')}
          />
        )
      ) : null}
      <ConfirmSheet
        visible={remove}
        onClose={() => setRemove(false)}
        title={t('deletePost')}
        description={t('deletePostBody')}
        confirmLabel={t('deletePost')}
        cancelLabel={t('cancel')}
        onConfirm={async () => {
          await action.run({ action: 'deletePost', id: post.id })
          router.replace('/feed')
        }}
      />
    </Card>
  )
}

type PageQuery<T> = {
  data?: { pages: SocialPage<T>[] }
  isPending: boolean
  isError: boolean
  isFetching: boolean
  isFetchingNextPage: boolean
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
}: {
  query: PageQuery<T>
  rowKey: (row: T) => string
  renderRow: (row: T, visible: boolean) => ReactElement
  empty: string
  header?: ReactElement
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
  return (
    <FlatList
      data={rows}
      keyExtractor={rowKey}
      renderItem={({ item }) => renderRow(item, visible.has(rowKey(item)))}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 5 }}
      contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}
      style={{ flex: 1 }}
      ListHeaderComponent={header}
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
          <Spinner />
        ) : (
          <EmptyState
            title={
              query.fetchStatus === 'paused' ? t('offline') : query.isError ? t('failed') : empty
            }
          />
        )
      }
      ListFooterComponent={
        query.isError ? (
          <Button
            variant="neutral"
            onPress={() => {
              void query.refetch()
            }}
          >
            {t('retry')}
          </Button>
        ) : query.hasNextPage ? (
          <Button variant="ghost" loading={query.isFetchingNextPage} onPress={next}>
            {t('loadMore')}
          </Button>
        ) : rows.length ? (
          <Text variant="meta" className="text-center">
            {t('end')}
          </Text>
        ) : null
      }
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
  if (pending && !paused) return <Spinner />
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
