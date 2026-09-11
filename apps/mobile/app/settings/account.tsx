import { format, parseISO } from 'date-fns'
import * as Clipboard from 'expo-clipboard'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Keyboard, Modal, ScrollView, type TextInput, View } from 'react-native'

import {
  storedImageSource,
  uploadAvatar,
  useAvatarUrl,
  useProfile,
  useSession,
  useUpdateProfile,
} from '@/data'
import { changeAccountPassword, hasAccountPassword } from '@/data/account-password'
import { asAuthProblem, deleteAccount } from '@/data/auth'
import { openManageSubscriptions } from '@/data/purchases'
import { PasswordField, useAuthMessage, useCaptchaToken } from '@/features/auth'
import { usePlanSummary } from '@/features/paywall'
import { datePattern } from '@/lib/dates'
import { openLegal, PRIVACY_URL, TERMS_URL } from '@/lib/legal'
import { useBack } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Avatar,
  Button,
  Card,
  Icon,
  IconButton,
  ListRow,
  Screen,
  Sheet,
  Tappable,
  Text,
  TextField,
  useToast,
} from '@/ui'

export default function AccountScreen() {
  const { t } = useTranslation(['profile', 'common', 'onboarding'])
  const goBack = useBack('/me')
  const toast = useToast()
  const { session } = useSession()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const plan = usePlanSummary()
  const { data: avatarUri } = useAvatarUrl(profile?.avatar_path ?? undefined)
  const memberSince = profile?.created_at ?? session?.user.created_at
  const avatar = storedImageSource(profile?.avatar_path ?? undefined, avatarUri)
  const [photoPending, setPhotoPending] = useState(false)
  const pickingPhoto = useRef(false)
  const busy = photoPending || updateProfile.isPending
  // An untouched draft follows the query, including a profile that loads late.
  const [draft, setDraft] = useState<string>()
  const name = draft ?? profile?.display_name ?? ''
  const [submitted, setSubmitted] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const saving = useRef<Promise<boolean> | null>(null)
  const leaving = useRef(false)
  const colors = useThemeColors()
  const [copied, setCopied] = useState(false)
  const copyReset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(copyReset.current), [])

  const save = (): Promise<boolean> => {
    if (saving.current) return saving.current
    if (!profile || draft === undefined) return Promise.resolve(true)
    setSubmitted(true)
    if (!name.trim()) return Promise.resolve(false)
    if (name.trim() === (profile.display_name ?? '')) {
      setDraft(undefined)
      return Promise.resolve(true)
    }
    // Blur, Back and photo picking can arrive together. Share the same save.
    saving.current = (async () => {
      try {
        await updateProfile.mutateAsync({ displayName: name.trim() })
        setDraft((current) => (current === draft ? undefined : current))
        toast.show({ title: t('profile:account.saved') })
        return true
      } catch {
        toast.show({ title: t('profile:account.saveFailed'), tone: 'error' })
        return false
      } finally {
        saving.current = null
      }
    })()
    return saving.current
  }

  const copyEmail = async () => {
    if (!session?.user.email) return
    try {
      if (!(await Clipboard.setStringAsync(session.user.email))) throw new Error('Copy failed')
      setCopied(true)
      clearTimeout(copyReset.current)
      copyReset.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.show({ title: t('profile:account.copyFailed'), tone: 'error' })
    }
  }

  const changePhoto = async () => {
    if (pickingPhoto.current || !profile) return
    pickingPhoto.current = true
    setPhotoPending(true)
    Keyboard.dismiss()
    try {
      if (!(await save())) return
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })
      if (result.canceled || !result.assets[0]) return
      const avatarPath = await uploadAvatar(result.assets[0].uri)
      await updateProfile.mutateAsync({ avatarPath })
      toast.show({ title: t('profile:account.photoSaved') })
    } catch {
      toast.show({ title: t('profile:account.photoFailed'), tone: 'error' })
    } finally {
      pickingPhoto.current = false
      setPhotoPending(false)
    }
  }

  return (
    <Screen>
      <AppBar
        title={t('profile:account.title')}
        onBack={async () => {
          if (leaving.current) return
          leaving.current = true
          Keyboard.dismiss()
          if (await save()) goBack()
          else leaving.current = false
        }}
        backLabel={t('common:a11y.back')}
      />
      <View className="items-center gap-3 py-2">
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={t('profile:account.changePhoto')}
          accessibilityState={{ disabled: !profile || busy, busy: photoPending }}
          disabled={!profile || busy}
          onPress={changePhoto}
          className="self-center"
        >
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Avatar
              name={name}
              uri={avatar?.uri}
              cacheKey={avatar?.cacheKey}
              size="md"
              tone="pandan"
            />
            <View className="absolute -bottom-1 -right-2 h-7 w-7 items-center justify-center rounded-full border-2 border-canvas bg-surface">
              <Icon set="system" name="camera" size={16} tintColor={colors.muted} />
            </View>
            {photoPending ? (
              <View className="absolute inset-0 items-center justify-center rounded-card bg-surface/70">
                <ActivityIndicator color={colors.pandan} />
              </View>
            ) : null}
          </View>
        </Tappable>
        {memberSince ? (
          <Text variant="meta">
            {t('profile:home.memberSince', {
              month: format(parseISO(memberSince), datePattern('monthYear')),
            })}
          </Text>
        ) : null}
      </View>
      <Card contentClassName="gap-0">
        {session?.user.email ? (
          <View className="gap-1 border-b-2 border-track pb-4">
            <Text variant="label">{t('onboarding:account.email')}</Text>
            <View className="flex-row items-center gap-2">
              <Text
                variant="body"
                className="flex-1 text-muted"
                selectable
                accessibilityLabel={t('onboarding:account.email')}
              >
                {session.user.email}
              </Text>
              <IconButton
                variant="ghost"
                size="sm"
                onPress={copyEmail}
                className="self-center"
                accessibilityLabel={t(copied ? 'profile:account.copied' : 'profile:account.copy')}
              >
                <CopyMark copied={copied} />
              </IconButton>
            </View>
          </View>
        ) : null}
        <View className="border-b-2 border-track py-4">
          <TextField
            label={t('profile:account.name')}
            value={name}
            onChangeText={setDraft}
            editable={Boolean(profile) && !busy}
            autoComplete="name"
            textContentType="name"
            maxLength={60}
            returnKeyType="done"
            onBlur={save}
            onSubmitEditing={() => Keyboard.dismiss()}
            className="min-h-[48px] border-0 bg-track"
            error={submitted && !name.trim() ? t('profile:account.nameRequired') : undefined}
          />
        </View>
        <ListRow
          title={t('profile:account.changePassword')}
          leading={<Icon set="system" name="lock" size={24} tintColor={colors.muted} />}
          disabled={busy}
          onPress={() => {
            Keyboard.dismiss()
            setPasswordOpen(true)
          }}
        />
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={t('profile:account.action')}
          disabled={busy}
          onPress={() => {
            Keyboard.dismiss()
            setConfirming(true)
          }}
        >
          <View className="min-h-[52px] flex-row items-center gap-md pt-3.5">
            <Icon set="ui" name="delete" size={24} tintColor={colors.hibiscus} />
            <Text variant="bodyStrong" className="flex-1 text-hibiscus">
              {t('profile:account.action')}
            </Text>
            <Icon set="ui" name="chevron-right" size={20} tintColor={colors.faint} />
          </View>
        </Tappable>
      </Card>
      {plan.renews ? (
        <View className="gap-2">
          <Text variant="meta">{t('profile:account.cancelFirst')}</Text>
          <Button variant="ghost" size="sm" onPress={() => openManageSubscriptions()}>
            {t('profile:subscription.manage')}
          </Button>
        </View>
      ) : null}

      <View className="flex-row flex-wrap justify-center gap-x-5 gap-y-1">
        {[
          [PRIVACY_URL, t('profile:account.privacy')],
          [TERMS_URL, t('profile:account.terms')],
        ].map(([url, label]) => (
          <Tappable
            key={url}
            accessibilityRole="link"
            onPress={() => openLegal(url)}
            className="min-h-[44px] justify-center"
          >
            <Text variant="meta" className="underline">
              {label}
            </Text>
          </Tappable>
        ))}
      </View>

      {passwordOpen ? <ChangePassword onClose={() => setPasswordOpen(false)} /> : null}
      {confirming ? <DeleteAccount onClose={() => setConfirming(false)} /> : null}
    </Screen>
  )
}

// Mounted only while open so a dismissed password never survives in the form.
function ChangePassword({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(['auth', 'profile', 'common'])
  const toast = useToast()
  const message = useAuthMessage()
  const colorsForLoading = useThemeColors().pandan
  const captcha = useCaptchaToken()
  const [hasPassword, setHasPassword] = useState<boolean>()
  const [loadFailed, setLoadFailed] = useState(false)
  const [current, setCurrent] = useState('')
  const [currentWrong, setCurrentWrong] = useState(false)
  const newPasswordRef = useRef<TextInput>(null)
  useEffect(() => {
    if (loadFailed) return
    let active = true
    hasAccountPassword().then(
      (value) => {
        if (active) setHasPassword(value)
      },
      () => {
        if (active) setLoadFailed(true)
      },
    )
    return () => {
      active = false
    }
  }, [loadFailed])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)
  const running = useRef(false)
  const confirmRef = useRef<TextInput>(null)
  const tooShort = password.length < 8
  const mismatched = password !== confirm

  const save = async () => {
    if (running.current) return
    setSubmitted(true)
    if (hasPassword === undefined || tooShort || mismatched || (hasPassword && !current)) return
    running.current = true
    setPending(true)
    try {
      setCurrentWrong(false)
      await changeAccountPassword(
        password,
        current || undefined,
        hasPassword ? await captcha() : undefined,
      )
      Keyboard.dismiss()
      onClose()
      toast.show({ title: t('auth:reset.done') })
    } catch (error) {
      if (asAuthProblem(error).reason === 'invalid_credentials') {
        setHasPassword(true)
        setCurrentWrong(true)
      } else {
        toast.show({ title: message(error), tone: 'error' })
      }
    } finally {
      running.current = false
      setPending(false)
    }
  }

  return (
    <Sheet
      fullHeight
      visible
      onClose={onClose}
      dismissible={!pending}
      closeLabel={t('common:action.close')}
      title={t('profile:account.changePassword')}
    >
      {hasPassword === undefined ? (
        loadFailed ? (
          <Button onPress={() => setLoadFailed(false)}>{t('common:action.retry')}</Button>
        ) : (
          <ActivityIndicator color={colorsForLoading} />
        )
      ) : (
        <>
          {hasPassword ? (
            <PasswordField
              label={t('profile:account.currentPassword')}
              value={current}
              onChangeText={(value) => {
                setCurrent(value)
                setCurrentWrong(false)
              }}
              autoComplete="current-password"
              textContentType="password"
              editable={!pending}
              returnKeyType="next"
              onSubmitEditing={() => newPasswordRef.current?.focus()}
              error={
                currentWrong
                  ? t('profile:account.currentPasswordWrong')
                  : submitted && !current
                    ? t('auth:errors.passwordRequired')
                    : undefined
              }
            />
          ) : null}
          <PasswordField
            ref={newPasswordRef}
            label={t('auth:reset.field')}
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth:password.placeholder')}
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!pending}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            error={submitted && tooShort ? t('auth:errors.passwordShort') : undefined}
          />
          <PasswordField
            ref={confirmRef}
            label={t('auth:reset.confirmField')}
            value={confirm}
            onChangeText={setConfirm}
            placeholder={t('auth:password.placeholder')}
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!pending}
            returnKeyType="done"
            onSubmitEditing={save}
            error={
              submitted && !tooShort && mismatched ? t('auth:errors.passwordMismatch') : undefined
            }
          />
          <Button fullWidth onPress={save} loading={pending} disabled={pending}>
            {t('common:action.save')}
          </Button>
        </>
      )}
    </Sheet>
  )
}

function DeleteAccount({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(['profile', 'common'])
  const toast = useToast()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const running = useRef(false)
  const confirmed = confirmation === 'delete'

  const remove = async () => {
    if (!confirmed || running.current) return
    running.current = true
    setPending(true)
    Keyboard.dismiss()
    try {
      await deleteAccount()
      toast.show({ title: t('profile:account.done') })
      onClose()
    } catch {
      toast.show({ title: t('profile:account.failed'), tone: 'error' })
    } finally {
      running.current = false
      setPending(false)
    }
  }

  return (
    <Sheet
      fullHeight
      visible
      onClose={onClose}
      dismissible={!pending}
      closeLabel={t('common:action.close')}
    >
      <View className="flex-row items-center gap-1">
        <Text variant="subtitle" className="shrink">
          {t('profile:account.confirmTitle')}
        </Text>
        <IconButton
          variant="ghost"
          size="sm"
          className="self-center"
          accessibilityLabel={t('profile:account.deleteDetails')}
          onPress={() => {
            Keyboard.dismiss()
            setDetailsOpen(true)
          }}
        >
          <Icon set="ui" name="info" size={20} style={{ transform: [{ translateY: -2 }] }} />
        </IconButton>
      </View>
      <Text variant="body">{t('profile:account.confirmBody')}</Text>
      <TextField
        label={t('profile:account.typeDelete')}
        value={confirmation}
        onChangeText={setConfirmation}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!pending}
        returnKeyType="done"
        onSubmitEditing={remove}
      />
      <View className="gap-2">
        <Button
          variant="danger"
          fullWidth
          onPress={remove}
          disabled={!confirmed || pending}
          loading={pending}
        >
          {t('common:action.delete')}
        </Button>
        <Button variant="ghost" fullWidth onPress={onClose} disabled={pending}>
          {t('common:action.cancel')}
        </Button>
      </View>
      <Modal
        visible={detailsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailsOpen(false)}
      >
        <View className="flex-1 justify-center bg-black/30 px-6 py-16">
          <Tappable
            haptics={false}
            className="absolute inset-0"
            accessibilityLabel={t('common:action.close')}
            accessibilityRole="button"
            onPress={() => setDetailsOpen(false)}
          />
          <View className="max-h-full rounded-lg bg-surface p-5" accessibilityViewIsModal>
            <ScrollView>
              <Text variant="subtitle">{t('profile:account.deleteDetails')}</Text>
              <View className="gap-3 py-4">
                {(['goesDiary', 'goesPhotos', 'goesRecipes', 'goesProfile'] as const).map((key) => (
                  <View key={key} className="flex-row gap-2">
                    <Text variant="body" accessibilityElementsHidden importantForAccessibility="no">
                      •
                    </Text>
                    <Text variant="body" className="flex-1">
                      {t(`profile:account.${key}`)}
                    </Text>
                  </View>
                ))}
              </View>
              <Button variant="ghost" size="sm" onPress={() => setDetailsOpen(false)}>
                {t('common:action.close')}
              </Button>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Sheet>
  )
}

function CopyMark({ copied }: { copied: boolean }) {
  const colors = useThemeColors()
  return (
    <View style={{ width: 22, height: 22 }} accessible={false}>
      {copied ? (
        <View
          style={{
            position: 'absolute',
            left: 7,
            top: 2,
            width: 8,
            height: 15,
            borderRightWidth: 2,
            borderBottomWidth: 2,
            borderColor: colors.pandan,
            transform: [{ rotate: '45deg' }],
          }}
        />
      ) : (
        <>
          <View
            style={{
              position: 'absolute',
              left: 3,
              top: 3,
              width: 12,
              height: 14,
              borderWidth: 1.8,
              borderRadius: 2,
              borderColor: colors.ink,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 7,
              top: 7,
              width: 12,
              height: 14,
              borderWidth: 1.8,
              borderRadius: 2,
              borderColor: colors.ink,
              backgroundColor: colors.surface,
            }}
          />
        </>
      )}
    </View>
  )
}
