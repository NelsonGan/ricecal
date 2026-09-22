import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useUserId } from '@/data'
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
} from '@/features/social/components'
import { socialRequestId } from '@/features/social/request-id'
import { Button, ConfirmSheet, Screen, Tappable, Text, TextField } from '@/ui'

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
  const [remove, setRemove] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const draftLength = draft.length
  const canSave = Boolean(draft.trim()) && draftLength <= COMMENT_LIMIT
  return (
    <View className="gap-2 border-b border-line py-3">
      <Tappable
        className="flex-row items-center gap-3"
        onPress={() =>
          router.push({ pathname: '/social/profile/[id]', params: { id: comment.author_id } })
        }
        accessibilityLabel={comment.display_name}
      >
        <SocialPhoto
          path={comment.avatar_path}
          avatar
          label={comment.display_name}
          visible={visible}
        />
        <Text variant="label">{comment.display_name}</Text>
      </Tappable>
      {editing ? (
        <View className="gap-2">
          <TextField
            label={t('comment')}
            labelAction={
              <Text variant="meta">
                {t('characterCount', { count: draftLength, limit: COMMENT_LIMIT })}
              </Text>
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
              variant="neutral"
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
      {comment.author_id === viewer ? (
        <ReviewNotice
          status={comment.quarantined ? 'quarantined' : comment.review_status}
          reason={comment.review_reason}
          kind="comment"
          id={comment.id}
        />
      ) : (
        <ContentSafety kind="comment" id={comment.id} authorId={comment.author_id} />
      )}
      {comment.author_id === viewer || owner === viewer ? (
        <Button size="sm" variant="ghost" disabled={!online} onPress={() => setRemove(true)}>
          {t('deleteComment')}
        </Button>
      ) : null}
      {comment.author_id === viewer && !editing ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={!online}
          onPress={() => {
            setDraft(comment.body)
            setEditing(true)
          }}
        >
          {t('common:action.edit')}
        </Button>
      ) : null}
      <ConfirmSheet
        visible={remove}
        onClose={() => setRemove(false)}
        title={t('deleteComment')}
        description={t('deleteCommentBody')}
        confirmLabel={t('deleteComment')}
        cancelLabel={t('cancel')}
        onConfirm={async () => {
          await action.run({ action: 'deleteComment', id: comment.id })
        }}
      />
    </View>
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
          <View className="gap-2">
            <TextField
              label={t('comment')}
              labelAction={
                <Text variant="meta">
                  {t('characterCount', { count: bodyLength, limit: COMMENT_LIMIT })}
                </Text>
              }
              placeholder={t('commentPlaceholder')}
              value={body}
              onChangeText={setBody}
              editable={!action.isPending}
              multiline
              maxLength={COMMENT_LIMIT}
              inputClassName="max-h-[100px] py-2"
            />
            <Button
              size="sm"
              disabled={!online || !canSend}
              loading={action.isPending}
              onPress={() => {
                void send()
              }}
            >
              {t('send')}
            </Button>
          </View>
        ) : undefined
      }
    >
      {post.data ? (
        <SocialList
          query={comments}
          rowKey={(comment) => comment.id}
          renderRow={(comment, visible) => (
            <CommentRow comment={comment} owner={post.data?.author_id ?? ''} visible={visible} />
          )}
          empty={t('emptyComments')}
          header={
            <View className="gap-4">
              <PostCard post={post.data} detail />
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
