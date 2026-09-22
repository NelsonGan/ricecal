import { Image } from 'expo-image'
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
  JoinPrompt,
  QueryNotice,
  ReviewNotice,
  SocialBar,
  SocialPhoto,
  useSocialTask,
} from '@/features/social/components'
import { socialRequestId } from '@/features/social/request-id'
import { Button, Icon, IconButton, Screen, Select, Sheet, Text, TextField } from '@/ui'

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
  const [detailsOpen, setDetailsOpen] = useState(false)
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
  const foodName = existing?.food_name ?? entry?.food_name ?? ''
  const photo = existing?.photo_path
  const icon = toIcon(
    existing?.icon_set ?? entry?.icon_set ?? null,
    existing?.icon_name ?? entry?.icon_name ?? null,
  )
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
      header={
        <SocialBar
          title={t(editing ? 'editPost' : 'newPost')}
          action={
            own.data?.review_status === 'approved' && !own.data.quarantined && loaded ? (
              <Button
                size="sm"
                variant="ghost"
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
        />
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
          <View className="gap-2">
            <View className="flex-row items-start gap-3">
              <View className="h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-tile bg-pandan-soft">
                <View className="absolute items-center justify-center">
                  <Icon {...(icon ?? { set: 'food', name: 'cooking-pot' })} size={58} />
                </View>
                {privatePhoto.data ? (
                  <Image
                    source={{ uri: privatePhoto.data }}
                    cachePolicy="none"
                    contentFit="cover"
                    style={{ width: '100%', height: '100%' }}
                    accessibilityLabel={foodName}
                  />
                ) : photo ? (
                  <SocialPhoto path={photo} label={foodName} />
                ) : null}
              </View>

              <View className="min-w-0 flex-1 gap-2">
                <View className="flex-row items-start gap-1">
                  <Text variant="bodyStrong" className="min-w-0 flex-1" numberOfLines={2}>
                    {foodName}
                  </Text>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    hitSlop={3}
                    accessibilityLabel={t('shareInfo')}
                    onPress={() => setDetailsOpen(true)}
                  >
                    <Icon set="ui" name="info" size={20} />
                  </IconButton>
                </View>
                <TextField
                  accessibilityLabel={t('caption')}
                  placeholder={t('captionPlaceholder')}
                  value={caption}
                  onChangeText={setCaption}
                  maxLength={280}
                  multiline
                  className="min-h-[76px] items-start px-4"
                  inputClassName="min-h-[68px] py-3"
                />
              </View>
            </View>
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
            closeLabel={t('cancel')}
          >
            <Text>{t('shareHint')}</Text>
          </Sheet>
        </>
      )}
    </Screen>
  )
}
