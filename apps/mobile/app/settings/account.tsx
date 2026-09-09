import * as Clipboard from 'expo-clipboard'
import * as ImagePicker from 'expo-image-picker'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, Modal, ScrollView, type TextInput, View } from 'react-native'

import {
  storedImageSource,
  uploadAvatar,
  useAvatarUrl,
  useProfile,
  useSession,
  useUpdateProfile,
} from '@/data'
import { deleteAccount, updatePassword } from '@/data/auth'
import { openManageSubscriptions } from '@/data/purchases'
import { PasswordField, useAuthMessage } from '@/features/auth'
import { usePlanSummary } from '@/features/paywall'
import { openLegal, PRIVACY_URL, TERMS_URL } from '@/lib/legal'
import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Avatar,
  Button,
  Card,
  Icon,
  IconButton,
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
  const avatar = storedImageSource(profile?.avatar_path ?? undefined, avatarUri)
  const [photoPending, setPhotoPending] = useState(false)
  const pickingPhoto = useRef(false)
  const busy = photoPending || updateProfile.isPending
  // An untouched draft follows the query, including a profile that loads late.
  const [draft, setDraft] = useState<string>()
  const name = draft ?? profile?.display_name ?? ''
  const [submitted, setSubmitted] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const saving = useRef(false)

  const save = async () => {
    if (saving.current || pickingPhoto.current || !profile) return
    setSubmitted(true)
    if (!name.trim()) return
    saving.current = true
    Keyboard.dismiss()
    try {
      await updateProfile.mutateAsync({ displayName: name.trim() })
      setDraft(undefined)
      toast.show({ title: t('profile:account.saved') })
    } catch {
      toast.show({ title: t('profile:account.saveFailed'), tone: 'error' })
    } finally {
      saving.current = false
    }
  }

  const copyEmail = async () => {
    if (!session?.user.email) return
    try {
      await Clipboard.setStringAsync(session.user.email)
      toast.show({ title: t('profile:account.copied') })
    } catch {
      toast.show({ title: t('profile:account.copyFailed'), tone: 'error' })
    }
  }

  const changePhoto = async () => {
    if (pickingPhoto.current || saving.current || !profile) return
    pickingPhoto.current = true
    setPhotoPending(true)
    Keyboard.dismiss()
    try {
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
        onBack={goBack}
        backLabel={t('common:a11y.back')}
      />
      <Card>
        <View className="flex-row items-center gap-3">
          <Avatar
            name={name}
            uri={avatar?.uri}
            cacheKey={avatar?.cacheKey}
            size="lg"
            tone="pandan"
          />
          <Button
            variant="ghost"
            size="sm"
            onPress={changePhoto}
            loading={photoPending}
            disabled={!profile || busy}
          >
            {t('profile:account.changePhoto')}
          </Button>
        </View>
        <TextField
          label={t('profile:account.name')}
          value={name}
          onChangeText={setDraft}
          editable={Boolean(profile) && !busy}
          autoComplete="name"
          textContentType="name"
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={save}
          error={submitted && !name.trim() ? t('profile:account.nameRequired') : undefined}
        />
        {session?.user.email ? (
          <TextField
            label={t('onboarding:account.email')}
            value={session.user.email}
            editable={false}
            accessibilityState={{ disabled: true }}
            className="pr-2 opacity-100"
            inputClassName="text-muted"
            rightSlot={
              <Button variant="secondary" size="sm" onPress={copyEmail}>
                {t('profile:account.copy')}
              </Button>
            }
          />
        ) : null}
        <Button
          fullWidth
          onPress={save}
          loading={updateProfile.isPending}
          disabled={!profile || busy || name.trim() === (profile.display_name ?? '')}
        >
          {t('common:action.save')}
        </Button>
      </Card>

      <Button
        variant="secondary"
        fullWidth
        disabled={busy}
        onPress={() => {
          Keyboard.dismiss()
          setPasswordOpen(true)
        }}
      >
        {t('profile:account.changePassword')}
      </Button>

      <View className="gap-2">
        <View className="flex-row items-center gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onPress={() => {
              Keyboard.dismiss()
              setConfirming(true)
            }}
          >
            {t('profile:account.action')}
          </Button>
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
            <Icon set="ui" name="info" size={20} />
          </IconButton>
        </View>
        {plan.renews ? (
          <View className="gap-2">
            <Text variant="meta">{t('profile:account.cancelFirst')}</Text>
            <Button variant="ghost" size="sm" onPress={() => openManageSubscriptions()}>
              {t('profile:subscription.manage')}
            </Button>
          </View>
        ) : null}
      </View>

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
    if (tooShort || mismatched) return
    running.current = true
    setPending(true)
    try {
      await updatePassword(password)
      Keyboard.dismiss()
      onClose()
      toast.show({ title: t('auth:reset.done') })
    } catch (error) {
      toast.show({ title: message(error), tone: 'error' })
    } finally {
      running.current = false
      setPending(false)
    }
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      dismissible={!pending}
      closeLabel={t('common:action.close')}
      title={t('profile:account.changePassword')}
      footer={
        <Button fullWidth onPress={save} loading={pending} disabled={pending}>
          {t('common:action.save')}
        </Button>
      }
    >
      <PasswordField
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
        error={submitted && !tooShort && mismatched ? t('auth:errors.passwordMismatch') : undefined}
      />
    </Sheet>
  )
}

function DeleteAccount({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(['profile', 'common'])
  const toast = useToast()
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
      visible
      onClose={onClose}
      dismissible={!pending}
      closeLabel={t('common:action.close')}
      title={t('profile:account.confirmTitle')}
      footer={
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
      }
    >
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
    </Sheet>
  )
}
