import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { removeAvatar, uploadAvatar, useAvatarUrl, useUserId } from '@/data'
import { useSocialOnline, useSocialProfile } from '@/data/social'
import { QueryNotice, ReviewNotice, SocialPhoto, useSocialTask } from '@/features/social/components'
import { useBack } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import { AppBar, Button, Icon, IconButton, Screen, Sheet, Text, TextField, useToast } from '@/ui'

export default function EditProfileScreen() {
  const { t } = useTranslation(['social', 'common'])
  const viewer = useUserId()
  const profile = useSocialProfile()
  const router = useRouter()
  const back = useBack('/feed')
  const colors = useThemeColors()
  const action = useSocialTask()
  const online = useSocialOnline()
  const toast = useToast()
  const [handle, setHandle] = useState('')
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [localAvatar, setLocalAvatar] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [handleTaken, setHandleTaken] = useState(false)
  const [info, setInfo] = useState<'join' | 'handle' | null>(null)
  const privateAvatar = useAvatarUrl(localAvatar ? undefined : (avatar ?? undefined))
  const initialized = useRef(false)
  const mounted = useRef(true)
  const stagedAvatar = useRef<string | null>(null)
  const saving = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // After Save starts, a late error cannot prove the server did not commit.
      if (stagedAvatar.current && !saving.current) void removeAvatar(stagedAvatar.current)
    }
  }, [])
  useEffect(() => {
    if (initialized.current || profile.isPending || profile.isError) return
    initialized.current = true
    if (profile.data) {
      setHandle(profile.data.handle)
      setName(profile.data.display_name)
      setBio(profile.data.bio)
      setAvatar(profile.data.avatar_path)
    }
  }, [profile.data, profile.isPending, profile.isError])
  const validHandle = /^[a-z0-9_]{3,24}$/.test(handle)
  const choosePhoto = async () => {
    if (picking) return
    setPicking(true)
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })
      if (result.canceled || !result.assets[0]) return
      const uri = result.assets[0].uri
      const path = await uploadAvatar(uri)
      if (!mounted.current) {
        await removeAvatar(path)
        return
      }
      const previous = stagedAvatar.current
      stagedAvatar.current = path
      setAvatar(path)
      setLocalAvatar(uri)
      if (previous) void removeAvatar(previous)
    } catch {
      toast.show({ title: t('saveFailed'), tone: 'error' })
    } finally {
      setPicking(false)
    }
  }
  const save = async () => {
    setSubmitted(true)
    if (!validHandle || !name.trim()) return
    saving.current = true
    try {
      await action.run({ action: 'profile', handle, name: name.trim(), bio: bio.trim(), avatar })
      if (stagedAvatar.current === avatar) stagedAvatar.current = null
      if (mounted.current)
        router.dismissTo({ pathname: '/social/profile/[id]', params: { id: viewer } })
    } catch (error) {
      /* Keep the complete draft after a refused write. */
      if (
        mounted.current &&
        typeof error === 'object' &&
        error &&
        'code' in error &&
        error.code === '23505'
      )
        setHandleTaken(true)
    } finally {
      saving.current = false
    }
  }
  const saveDisabled = !online || picking || profile.isPending || profile.isError
  return (
    <Screen
      header={
        <AppBar
          title={t(profile.data ? 'editProfile' : 'join')}
          onBack={back}
          backLabel={t('back')}
          action={
            <IconButton
              variant="ghost"
              size="sm"
              accessibilityLabel={t('save')}
              disabled={saveDisabled}
              loading={action.isPending}
              onPress={() => {
                void save()
              }}
            >
              <Icon set="ui" name="check" size={22} tintColor={colors.pandanInk} />
            </IconButton>
          }
        />
      }
    >
      {profile.isPending || profile.isError ? (
        <QueryNotice
          pending={profile.isPending}
          error={profile.isError}
          paused={profile.fetchStatus === 'paused'}
          retry={profile.refetch}
        />
      ) : (
        <>
          {profile.data ? (
            <ReviewNotice
              status={profile.data.quarantined ? 'quarantined' : profile.data.review_status}
              reason={profile.data.review_reason}
              kind="profile"
              id={viewer}
            />
          ) : null}
          <View className="flex-row items-start gap-3">
            {localAvatar ? (
              <Image
                source={{ uri: localAvatar }}
                style={{ width: 40, height: 40, borderRadius: 14 }}
                cachePolicy="none"
                accessibilityLabel={name || t('unknownPerson')}
              />
            ) : (
              <SocialPhoto
                path={null}
                privateUri={privateAvatar.data}
                avatar
                label={name || t('unknownPerson')}
              />
            )}
            <View className="min-w-0 flex-1 gap-1">
              <Button
                size="sm"
                variant="neutral"
                loading={picking}
                disabled={!online || action.isPending}
                onPress={() => {
                  void choosePhoto()
                }}
              >
                {t('avatar')}
              </Button>
              {avatar ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={action.isPending}
                  onPress={() => {
                    const staged = stagedAvatar.current
                    stagedAvatar.current = null
                    setAvatar(null)
                    setLocalAvatar(null)
                    if (staged) void removeAvatar(staged)
                  }}
                >
                  {t('removeAvatar')}
                </Button>
              ) : null}
            </View>
            {!profile.data ? (
              <IconButton
                variant="ghost"
                size="sm"
                accessibilityLabel={t('shareInfo')}
                onPress={() => setInfo('join')}
              >
                <Icon set="ui" name="info" size={22} />
              </IconButton>
            ) : null}
          </View>
          <TextField
            label={t('handle')}
            labelAction={
              <IconButton
                variant="ghost"
                size="xs"
                hitSlop={3}
                accessibilityLabel={t('handleHint')}
                onPress={() => setInfo('handle')}
              >
                <Icon set="ui" name="info" size={18} />
              </IconButton>
            }
            value={handle}
            onChangeText={(value) => {
              setHandle(value.toLowerCase())
              setHandleTaken(false)
            }}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={24}
            error={
              handleTaken
                ? t('handleTaken')
                : submitted && !validHandle
                  ? t('handleInvalid')
                  : undefined
            }
          />
          <TextField
            label={t('displayName')}
            value={name}
            onChangeText={setName}
            maxLength={60}
            error={submitted && !name.trim() ? t('nameInvalid') : undefined}
          />
          <TextField
            label={t('bio')}
            value={bio}
            onChangeText={setBio}
            maxLength={160}
            multiline
            inputClassName="min-h-[100px] py-3"
          />
          {bio.length >= 130 ? (
            <Text variant="meta">{t('characterCount', { count: bio.length, limit: 160 })}</Text>
          ) : null}
          {!online ? <Text variant="meta">{t('offline')}</Text> : null}
          <Sheet
            visible={info !== null}
            onClose={() => setInfo(null)}
            title={t(info === 'handle' ? 'handle' : 'join')}
            closeLabel={t('common:action.close')}
          >
            <Text>{t(info === 'handle' ? 'handleHint' : 'joinBody')}</Text>
          </Sheet>
        </>
      )}
    </Screen>
  )
}
