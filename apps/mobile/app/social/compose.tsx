import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useMealPhotoUrl, useSettings, useUserId, useWorkout } from '@/data'
import { toIcon } from '@/data/mappers'
import {
  type SocialAudience,
  useSocialEntry,
  useSocialOnline,
  useSocialPost,
  useWorkoutPost,
} from '@/data/social'
import {
  FoodPreview,
  QueryNotice,
  SocialBar,
  useSocialTask,
  WorkoutPostPreview,
} from '@/features/social/components'
import { WorkoutPreview } from '@/features/workouts/cards'
import { useBack } from '@/lib/navigation'
import { unitFor } from '@/lib/units'
import { Button, Icon, IconButton, Screen, Select, Sheet, Text, TextField } from '@/ui'

export default function ComposeScreen() {
  const {
    entryId = '',
    postId = '',
    workoutId = '',
  } = useLocalSearchParams<{
    entryId?: string
    postId?: string
    workoutId?: string
  }>()
  return (
    <Composer
      key={`${entryId}/${postId}/${workoutId}`}
      entryId={entryId}
      postId={postId}
      workoutId={workoutId}
    />
  )
}

function Composer({
  entryId,
  postId,
  workoutId,
}: {
  entryId: string
  postId: string
  /** Sharing a workout from its page, rather than a meal. */
  workoutId: string
}) {
  const { t } = useTranslation(['social', 'common'])
  const router = useRouter()
  const viewer = useUserId()
  const source = useSocialEntry(entryId)
  const workout = useWorkout(workoutId)
  const workoutPost = useWorkoutPost(workoutId)
  const { data: settings } = useSettings()
  const sourcePostId = source.data?.postId || workoutPost.data || ''
  const post = useSocialPost(postId || sourcePostId)
  const action = useSocialTask()
  const online = useSocialOnline()
  const [caption, setCaption] = useState('')
  const [audience, setAudience] = useState<SocialAudience>('public')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const initialized = useRef(false)
  // What the person has changed here already. A workout's page can open this
  // before it knows the workout was posted automatically; when the post turns
  // up, the screen becomes "Edit post", and seeding it wiped a caption half typed.
  const touched = useRef({ caption: false, audience: false })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const existing = post.data?.author_id === viewer ? post.data : null
  const editingPostId = postId || sourcePostId
  const finishEdit = useBack(
    editingPostId ? { pathname: '/social/post/[id]', params: { id: editingPostId } } : '/feed',
  )
  useEffect(() => {
    if (existing && !initialized.current) {
      initialized.current = true
      if (!touched.current.caption) setCaption(existing.caption)
      if (!touched.current.audience) setAudience(existing.audience)
    }
  }, [existing])
  const entry = source.data?.entry
  const editing = Boolean(postId || sourcePostId)
  const missingSource = !entryId && !postId && !workoutId
  // Editing changes only the caption and audience. The post preview reads the
  // entry's current food details, including its current drawing and totals.
  const preview = editing ? existing : entry
  const privatePhoto = useMealPhotoUrl(preview?.photo_path ?? undefined)
  const sharingWorkout = !editing && Boolean(workoutId)
  const aboutWorkout = sharingWorkout || existing?.kind === 'workout'
  const loaded = sharingWorkout ? workout.data : preview
  const reading = editing ? post : sharingWorkout ? workout : source
  const foodName = preview?.food_name ?? ''
  const icon = toIcon(preview?.icon_set ?? null, preview?.icon_name ?? null)
  const save = async () => {
    try {
      const result = await action.run(
        existing
          ? { action: 'editPost', id: existing.id, caption: caption.trim(), audience }
          : sharingWorkout
            ? { action: 'postWorkout', workoutId, caption: caption.trim(), audience }
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
        <SocialBar title={t(editing ? 'editPost' : aboutWorkout ? 'newWorkoutPost' : 'newPost')} />
      }
      footer={
        loaded ? (
          <Button
            fullWidth
            disabled={!online || action.isPending}
            loading={action.isPending}
            onPress={() => {
              void save()
            }}
          >
            {t(editing ? 'save' : 'post')}
          </Button>
        ) : undefined
      }
    >
      {missingSource ? (
        <QueryNotice unavailable retry={() => undefined} />
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
            {existing?.kind === 'workout' ? (
              <WorkoutPostPreview post={existing} />
            ) : sharingWorkout && workout.data ? (
              <WorkoutPreview
                name={workout.data.name}
                startedAt={workout.data.startedAt}
                durationS={workout.data.durationS}
                volumeKg={workout.data.volumeKg}
                sets={workout.data.setCount}
                records={workout.data.prCount}
                exercises={workout.data.exercises}
                unit={unitFor(settings?.units)}
              />
            ) : (
              <FoodPreview
                name={foodName}
                icon={icon}
                privateUri={privatePhoto.data}
                hasPhoto={Boolean(preview?.photo_path)}
                photoUnavailable={Boolean(
                  preview?.photo_path &&
                    (privatePhoto.isError || (privatePhoto.isSuccess && !privatePhoto.data)),
                )}
                facts={preview}
              />
            )}
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
              placeholder={t(aboutWorkout ? 'captionWorkoutPlaceholder' : 'captionPlaceholder')}
              value={caption}
              onChangeText={(text) => {
                touched.current.caption = true
                setCaption(text)
              }}
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
            onChange={(value) => {
              touched.current.audience = true
              setAudience(value)
            }}
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
            <Text>{t(aboutWorkout ? 'shareWorkoutHint' : 'shareHint')}</Text>
          </Sheet>
        </>
      )}
    </Screen>
  )
}
