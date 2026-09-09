import * as Clipboard from 'expo-clipboard'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, Modal, ScrollView, type TextInput, View } from 'react-native'

import { useProfile, useSession, useUpdateProfile } from '@/data'
import { deleteAccount, updatePassword } from '@/data/auth'
import { openManageSubscriptions } from '@/data/purchases'
import { PasswordField, useAuthMessage } from '@/features/auth'
import { usePlanSummary } from '@/features/paywall'
import { openLegal, PRIVACY_URL, TERMS_URL } from '@/lib/legal'
import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Button,
  Card,
  ConfirmSheet,
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
  // An untouched draft follows the query, including a profile that loads late.
  const [draft, setDraft] = useState<string>()
  const name = draft ?? profile?.display_name ?? ''
  const [submitted, setSubmitted] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const saving = useRef(false)

  const save = async () => {
    if (saving.current || !profile) return
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

  const remove = async () => {
    try {
      await deleteAccount()
      toast.show({ title: t('profile:account.done') })
    } catch {
      toast.show({ title: t('profile:account.failed'), tone: 'error' })
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
        <TextField
          label={t('profile:account.name')}
          value={name}
          onChangeText={setDraft}
          editable={Boolean(profile) && !updateProfile.isPending}
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
            labelAction={
              <Button variant="ghost" size="sm" onPress={copyEmail}>
                {t('profile:account.copy')}
              </Button>
            }
          />
        ) : null}
        <Button
          fullWidth
          onPress={save}
          loading={updateProfile.isPending}
          disabled={
            !profile || updateProfile.isPending || name.trim() === (profile.display_name ?? '')
          }
        >
          {t('common:action.save')}
        </Button>
      </Card>

      <Button
        variant="secondary"
        fullWidth
        disabled={updateProfile.isPending}
        onPress={() => {
          Keyboard.dismiss()
          setPasswordOpen(true)
        }}
      >
        {t('profile:account.changePassword')}
      </Button>

      <View className="gap-2">
        <View className="flex-row items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={updateProfile.isPending}
            labelClassName="text-hibiscus-ink"
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
      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={remove}
        title={t('profile:account.confirmTitle')}
        description={t('profile:account.confirmBody')}
        confirmLabel={t('common:action.delete')}
        cancelLabel={t('common:action.cancel')}
      />
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
