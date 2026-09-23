import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
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
import { useBack } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, IconButton, Screen, Select, Sheet, Text, TextField } from '@/ui'

export default function ComposeScreen() {
  const { entryId = '', postId = '' } = useLocalSearchParams<{
    entryId?: string
    postId?: string
  }>()
  return <Composer key={`${entryId}/${postId}`} entryId={entryId} postId={postId} />
}

function Composer({ entryId, postId }: { entryId: string; postId: string }) {
  const { t } = useTranslation(['social', 'common'])
  const router = useRouter()
  const colors = useThemeColors()
  const viewer = useUserId()
  const own = useSocialProfile()
  const source = useSocialEntry(entryId)
  const post = useSocialPost(postId || source.data?.postId || '')
  const action = useSocialTask()
  const online = useSocialOnline()
  const [caption, setCaption] = useState('')
  const [audience, setAudience] = useState<SocialAudience>('public')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const initialized = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const existing = post.data?.author_id === viewer ? post.data : null
  const editingPostId = postId || source.data?.postId || ''
  const finishEdit = useBack(
    editingPostId ? { pathname: '/social/post/[id]', params: { id: editingPostId } } : '/feed',
  )
  useEffect(() => {
    if (existing && !initialized.current) {
      initialized.current = true
      setCaption(existing.caption)
      setAudience(existing.audience)
    }
  }, [existing])
  const entry = source.data?.entry
  const editing = Boolean(postId || source.data?.postId)
  const missingSource = !entryId && !postId
  // Editing changes only the caption and audience. The post's nullable photo
  // and icon fields are part of its snapshot, so a null there must not fall
  // through to a newer photo or drawing on the source diary entry.
  const preview = editing ? existing : entry
  const privatePhoto = useMealPhotoUrl(preview?.photo_path ?? undefined)
  const loaded = preview
  const reading = editing ? post : source
  const foodName = preview?.food_name ?? ''
  const icon = toIcon(preview?.icon_set ?? null, preview?.icon_name ?? null)
  const save = async () => {
    try {
      const result = await action.run(
        existing
          ? { action: 'editPost', id: existing.id, caption: caption.trim(), audience }
          : { action: 'post', entryId, caption: caption.trim(), audience },
      )
      if (mounted.current && result.id) {
        if (existing) finishEdit()
        else router.replace({ pathname: '/social/post/[id]', params: { id: result.id } })
      }
    } catch {
      /* A retry keeps the draft, and the server returns the entry's one post. */
    }
  }
  return (
    <Screen
      header={
        <SocialBar
          title={t(editing ? 'editPost' : 'newPost')}
          action={
            own.data?.review_status === 'approved' && !own.data.quarantined && loaded ? (
              <IconButton
                size="sm"
                variant="ghost"
                accessibilityLabel={t(editing ? 'save' : 'publish')}
                disabled={!online}
                loading={action.isPending}
                onPress={() => {
                  void save()
                }}
              >
                {editing ? (
                  <Icon set="ui" name="check" size={22} tintColor={colors.pandanInk} />
                ) : (
                  <Icon set="system" name="send" size={22} tintColor={colors.pandanInk} />
                )}
              </IconButton>
            ) : undefined
          }
        />
      }
    >
      {missingSource ? (
        <QueryNotice unavailable retry={() => undefined} />
      ) : own.isPending || own.isError ? (
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
          <Button variant="secondary" onPress={() => router.push('/settings/account')}>
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
          {/* The post as others will see it, figures and all, so what is
              shared is on the screen before Share rather than in a hint. */}
          <View className="overflow-hidden rounded-tile">
            <FoodPreview
              name={foodName}
              icon={icon}
              privateUri={privatePhoto.data}
              hasPhoto={Boolean(preview?.photo_path)}
              facts={preview}
            />
          </View>
          <View className="gap-2">
            <TextField
              label={t('caption')}
              labelAction={
                <IconButton
                  variant="ghost"
                  size="xs"
                  hitSlop={3}
                  accessibilityLabel={t('shareInfo')}
                  onPress={() => setDetailsOpen(true)}
                >
                  <Icon set="ui" name="info" size={20} />
                </IconButton>
              }
              placeholder={t('captionPlaceholder')}
              value={caption}
              onChangeText={setCaption}
              maxLength={280}
              multiline
              className="min-h-[76px] items-start px-4"
              inputClassName="min-h-[68px] py-3"
            />
            {caption.length >= 240 ? (
              <Text variant="meta" className="text-right">
                {t('characterCount', { count: caption.length, limit: 280 })}
              </Text>
            ) : null}
          </View>

          <Select
            value={audience}
            onChange={setAudience}
            label={t('audience')}
            closeLabel={t('cancel')}
            options={[
              { value: 'public', label: t('everyone'), description: t('everyoneHint') },
              {
                value: 'followers',
                label: t('followersOnly'),
                description: t('followersHint'),
              },
            ]}
          />
          {!online ? <Text variant="meta">{t('offline')}</Text> : null}

          <Sheet
            visible={detailsOpen}
            onClose={() => setDetailsOpen(false)}
            title={t('share')}
            closeLabel={t('common:action.close')}
          >
            <Text>{t('shareHint')}</Text>
          </Sheet>
        </>
      )}
    </Screen>
  )
}
