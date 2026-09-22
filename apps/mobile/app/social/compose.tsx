import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMealPhotoUrl, useUserId } from '@/data'
import { toIcon } from '@/data/mappers'
import {
  type SocialAudience,
  useSocialEntry,
  useSocialOnline,
  useSocialPost,
  useSocialProfile,
} from '@/data/social'
import {
  FoodPreview,
  JoinPrompt,
  QueryNotice,
  ReviewNotice,
  SocialBar,
  useSocialTask,
} from '@/features/social/components'
import { socialRequestId } from '@/features/social/request-id'
import { Button, Screen, SegmentedControl, Text, TextField } from '@/ui'

export default function ComposeScreen() {
  const { entryId = '', postId = '' } = useLocalSearchParams<{
    entryId?: string
    postId?: string
  }>()
  return <Composer key={`${entryId}/${postId}`} entryId={entryId} postId={postId} />
}

function Composer({ entryId, postId }: { entryId: string; postId: string }) {
  const { t } = useTranslation('social')
  const router = useRouter()
  const viewer = useUserId()
  const own = useSocialProfile()
  const source = useSocialEntry(entryId)
  const post = useSocialPost(postId || source.data?.postId || '')
  const action = useSocialTask()
  const online = useSocialOnline()
  const [caption, setCaption] = useState('')
  const [audience, setAudience] = useState<SocialAudience>('public')
  const requestId = useRef(socialRequestId()).current
  const initialized = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const existing = post.data?.author_id === viewer ? post.data : null
  useEffect(() => {
    if (existing && !initialized.current) {
      initialized.current = true
      setCaption(existing.caption)
      setAudience(existing.audience)
    }
  }, [existing])
  const entry = source.data?.entry
  const privatePhoto = useMealPhotoUrl(existing?.photo_path ?? entry?.photo_path ?? undefined)
  const editing = Boolean(postId || source.data?.postId)
  const loaded = editing ? existing : entry
  const reading = editing ? post : source
  const save = async () => {
    try {
      const result = await action.run(
        existing
          ? { action: 'editPost', id: existing.id, caption: caption.trim(), audience }
          : { action: 'post', entryId, caption: caption.trim(), audience, requestId },
      )
      if (mounted.current && result.id) {
        router.replace({ pathname: '/social/post/[id]', params: { id: result.id } })
      }
    } catch {
      /* A retry uses the same id and keeps the user's draft. */
    }
  }
  return (
    <Screen
      header={<SocialBar title={t(editing ? 'editPost' : 'newPost')} />}
      footer={
        own.data?.review_status === 'approved' && !own.data.quarantined && loaded ? (
          <Button
            disabled={!online || action.isPending}
            loading={action.isPending}
            onPress={() => {
              void save()
            }}
          >
            {t(editing ? 'save' : 'publish')}
          </Button>
        ) : undefined
      }
    >
      {own.isPending || own.isError ? (
        <QueryNotice
          pending={own.isPending}
          error={own.isError}
          paused={own.fetchStatus === 'paused'}
          retry={own.refetch}
        />
      ) : !own.data ? (
        <JoinPrompt />
      ) : own.data.review_status !== 'approved' || own.data.quarantined ? (
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
      ) : !loaded ? (
        <QueryNotice
          pending={reading.isPending}
          error={reading.isError}
          paused={reading.fetchStatus === 'paused'}
          unavailable
          retry={reading.refetch}
        />
      ) : (
        <>
          <FoodPreview
            name={existing?.food_name ?? entry?.food_name ?? ''}
            photo={existing?.photo_path}
            privateUri={privatePhoto.data}
            icon={toIcon(
              existing?.icon_set ?? entry?.icon_set ?? null,
              existing?.icon_name ?? entry?.icon_name ?? null,
            )}
          />
          <TextField
            label={t('caption')}
            placeholder={t('captionPlaceholder')}
            value={caption}
            onChangeText={setCaption}
            maxLength={280}
            multiline
            inputClassName="min-h-[110px] py-3"
          />
          <Text variant="meta">{t('characterCount', { count: caption.length, limit: 280 })}</Text>
          <Text variant="label">{t('audience')}</Text>
          <SegmentedControl
            value={audience}
            onChange={setAudience}
            options={[
              { value: 'public', label: t('everyone') },
              { value: 'followers', label: t('followersOnly') },
            ]}
          />
          <Text variant="meta">{t(audience === 'public' ? 'everyoneHint' : 'followersHint')}</Text>
          <Text variant="meta">{t('shareHint')}</Text>
          {!online ? <Text variant="meta">{t('offline')}</Text> : null}
        </>
      )}
    </Screen>
  )
}
