import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useAvatarUrl, useUserId } from '@/data'
import {
  type SocialComment,
  useSocialComments,
  useSocialOnline,
  useSocialPost,
  useSocialProfile,
} from '@/data/social'
import {
  ContentSafety,
  JoinPrompt,
  PostCard,
  QueryNotice,
  ReviewNotice,
  SocialBar,
  SocialList,
  SocialPhoto,
  useSocialTask,
  useSocialTime,
} from '@/features/social/components'
import { socialRequestId } from '@/features/social/request-id'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, IconButton, Screen, Sheet, Tappable, Text, TextField } from '@/ui'

const COMMENT_LIMIT = 500

function CommentRow({
  comment,
  owner,
  visible,
}: {
  comment: SocialComment
  owner: string
  visible: boolean
}) {
  const { t } = useTranslation(['social', 'common'])
  const viewer = useUserId()
  const router = useRouter()
  const action = useSocialTask()
  const online = useSocialOnline()
  const [panel, setPanel] = useState<'options' | 'delete' | null>(null)
  const afterDismiss = useRef<(() => void) | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const draftLength = draft.length
  const canSave = Boolean(draft.trim()) && draftLength <= COMMENT_LIMIT
  const mine = comment.author_id === viewer
  const ownAvatar = useAvatarUrl(mine ? (comment.avatar_path ?? undefined) : undefined)
  const time = useSocialTime(comment.created_at)
  const openAuthor = () =>
    router.push({ pathname: '/social/profile/[id]', params: { id: comment.author_id } })
  return (
    <>
      <View className="border-b-2 border-track px-5 py-3">
        <View className="flex-row items-start gap-3">
          <Tappable
            className="h-[44px] w-[44px] items-center justify-center"
            onPress={openAuthor}
            accessibilityRole="button"
            accessibilityLabel={[comment.display_name, `@${comment.handle}`, time]
              .filter(Boolean)
              .join(', ')}
          >
            <SocialPhoto
              path={mine ? null : comment.avatar_path}
              privateUri={ownAvatar.data}
              avatar
              label={comment.display_name}
              visible={visible}
            />
          </Tappable>
          <View className="min-w-0 flex-1 gap-1.5">
            <View className="flex-row flex-wrap items-baseline gap-2">
              <Tappable
                hitSlop={10}
                onPress={openAuthor}
                accessibilityRole="button"
                accessibilityLabel={[comment.display_name, `@${comment.handle}`]
                  .filter(Boolean)
                  .join(', ')}
              >
                <Text variant="label" numberOfLines={1}>
                  {comment.display_name}
                </Text>
              </Tappable>
              {time ? <Text variant="meta">{time}</Text> : null}
            </View>
            {editing ? (
              <View className="gap-2">
                <TextField
                  accessibilityLabel={t('comment')}
                  labelAction={
                    draftLength >= 450 ? (
                      <Text variant="meta">
                        {t('characterCount', { count: draftLength, limit: COMMENT_LIMIT })}
                      </Text>
                    ) : undefined
                  }
                  value={draft}
                  onChangeText={setDraft}
                  maxLength={COMMENT_LIMIT}
                  multiline
                  editable={!action.isPending}
                  inputClassName="max-h-[100px] min-h-[60px] py-2"
                />
                <View className="flex-row gap-2">
                  <Button
                    size="sm"
                    disabled={!online || !canSave}
                    loading={action.isPending}
                    onPress={() => {
                      if (!canSave || action.isPending) return
                      void action
                        .run({ action: 'editComment', id: comment.id, body: draft.trim() })
                        .then(() => setEditing(false))
                        .catch(() => undefined)
                    }}
                  >
                    {t('save')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={action.isPending}
                    onPress={() => setEditing(false)}
                  >
                    {t('cancel')}
                  </Button>
                </View>
              </View>
            ) : (
              <Text>{comment.body}</Text>
            )}
            {mine ? (
              <ReviewNotice
                status={comment.quarantined ? 'quarantined' : comment.review_status}
                reason={comment.review_reason}
                kind="comment"
                id={comment.id}
              />
            ) : null}
          </View>
          {mine ? (
            <IconButton
              size="sm"
              variant="ghost"
              disabled={!online || editing}
              loading={action.isPending}
              accessibilityLabel={t('options')}
              onPress={() => setPanel('options')}
            >
              <Icon set="ui" name="more-horizontal" size={22} />
            </IconButton>
          ) : (
            <ContentSafety
              kind="comment"
              id={comment.id}
              authorId={comment.author_id}
              onBlocked={comment.author_id === owner ? () => router.dismissTo('/feed') : undefined}
              extraAction={
                owner === viewer
                  ? {
                      label: t('deleteComment'),
                      description: t('deleteCommentBody'),
                      input: { action: 'deleteComment', id: comment.id },
                      disabled: !online,
                    }
                  : undefined
              }
            />
          )}
        </View>
      </View>
      <Sheet
        visible={panel !== null}
        onClose={() => setPanel(null)}
        onDismiss={() => {
          const next = afterDismiss.current
          afterDismiss.current = null
          next?.()
        }}
        dismissible={!action.isPending}
        closeLabel={t('cancel')}
        title={t(panel === 'delete' ? 'deleteComment' : 'options')}
        description={panel === 'delete' ? t('deleteCommentBody') : undefined}
        scrollResetKey={panel ?? 'closed'}
        footer={
          panel === 'delete' ? (
            <View className="flex-row gap-3">
              <Button
                variant="danger"
                className="flex-1"
                loading={action.isPending}
                disabled={!online}
                onPress={() => {
                  afterDismiss.current = () => {
                    void action
                      .run({ action: 'deleteComment', id: comment.id })
                      .catch(() => undefined)
                  }
                  setPanel(null)
                }}
              >
                {t('deleteComment')}
              </Button>
              <Button
                variant="neutral"
                className="flex-1"
                disabled={action.isPending}
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
              disabled={!online}
              onPress={() => {
                afterDismiss.current = () => {
                  setDraft(comment.body)
                  setEditing(true)
                }
                setPanel(null)
              }}
            >
              {t('common:action.edit')}
            </Button>
            <Button
              fullWidth
              variant="ghost"
              contentClassName="justify-start"
              disabled={!online}
              onPress={() => setPanel('delete')}
            >
              {t('deleteComment')}
            </Button>
          </>
        ) : null}
      </Sheet>
    </>
  )
}

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <Post key={id} id={id} />
}

function Post({ id }: { id: string }) {
  const { t } = useTranslation('social')
  const router = useRouter()
  const post = useSocialPost(id)
  const comments = useSocialComments(id)
  const own = useSocialProfile()
  const online = useSocialOnline()
  const action = useSocialTask()
  const colors = useThemeColors()
  const [body, setBody] = useState('')
  const bodyLength = body.length
  const canSend = Boolean(body.trim()) && bodyLength <= COMMENT_LIMIT
  const requestId = useRef(socialRequestId())
  const send = async () => {
    if (!canSend || action.isPending) return
    try {
      await action.run({
        action: 'comment',
        postId: id,
        body: body.trim(),
        requestId: requestId.current,
      })
      setBody('')
      requestId.current = socialRequestId()
    } catch {
      /* Retain the comment and request id for retry. */
    }
  }
  return (
    <Screen
      scroll={false}
      flush
      header={<SocialBar title={t('post')} />}
      footer={
        post.data?.review_status === 'approved' &&
        own.data?.review_status === 'approved' &&
        !own.data.quarantined ? (
          <TextField
            accessibilityLabel={t('comment')}
            labelAction={
              bodyLength >= 450 ? (
                <Text variant="meta">
                  {t('characterCount', { count: bodyLength, limit: COMMENT_LIMIT })}
                </Text>
              ) : undefined
            }
            placeholder={t('commentPlaceholder')}
            value={body}
            onChangeText={setBody}
            editable={!action.isPending}
            multiline
            maxLength={COMMENT_LIMIT}
            inputClassName="max-h-[100px] py-2"
            rightSlot={
              <IconButton
                variant="ghost"
                size="sm"
                accessibilityLabel={t('send')}
                disabled={!online || !canSend}
                loading={action.isPending}
                onPress={() => {
                  void send()
                }}
              >
                <Icon set="system" name="send" size={23} tintColor={colors.pandanInk} />
              </IconButton>
            }
          />
        ) : undefined
      }
    >
      {post.data ? (
        <SocialList
          query={comments}
          variant="feed"
          rowKey={(comment) => comment.id}
          renderRow={(comment, visible) => (
            <CommentRow comment={comment} owner={post.data?.author_id ?? ''} visible={visible} />
          )}
          empty={t('emptyComments')}
          header={
            <View>
              <PostCard post={post.data} detail />
              <View className="gap-3 px-5 py-4">
                {!own.data && (own.isPending || own.isError) ? (
                  <QueryNotice
                    pending={own.isPending}
                    error={own.isError}
                    paused={own.fetchStatus === 'paused'}
                    retry={own.refetch}
                  />
                ) : null}
                {!own.data && !own.isPending && !own.isError ? <JoinPrompt /> : null}
                {own.data && (own.data.review_status !== 'approved' || own.data.quarantined) ? (
                  <>
                    <ReviewNotice
                      status={own.data.quarantined ? 'quarantined' : own.data.review_status}
                      reason={own.data.review_reason}
                      kind="profile"
                      id={own.data.user_id}
                    />
                    <Button variant="secondary" onPress={() => router.push('/social/edit-profile')}>
                      {t('editProfile')}
                    </Button>
                  </>
                ) : null}
              </View>
            </View>
          }
        />
      ) : (
        <View className="p-5">
          <QueryNotice
            pending={post.isPending}
            error={post.isError}
            paused={post.fetchStatus === 'paused'}
            unavailable
            retry={post.refetch}
          />
        </View>
      )}
    </Screen>
  )
}
