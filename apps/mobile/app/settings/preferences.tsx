import { useTranslation } from 'react-i18next'
import { useSettings, useUpdateSettings } from '@/data'
import { useBack } from '@/lib/navigation'
import { useTheme } from '@/theme/useTheme'
import { AppBar, Card, Screen, SegmentedControl, Text } from '@/ui'

/** U5 PREFERENCES */
export default function PreferencesScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const goBack = useBack('/me')
  // Appearance lives in the theme, not in `user_settings`: one owner, so the
  // toggle and what is on screen can never disagree.
  const { preference, setPreference } = useTheme()
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  return (
    <Screen>
      <AppBar
        title={t('preferences.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      <Card title={t('preferences.language')}>
        <SegmentedControl
          options={[
            { value: 'en', label: t('preferences.english') },
            { value: 'ms', label: t('preferences.bahasa') },
          ]}
          value={settings?.language ?? 'en'}
          // Only English is bundled, so this records the choice without
          // switching i18next to a locale that has no strings.
          onChange={(language) => updateSettings.mutate({ language })}
          accessibilityLabel={t('preferences.language')}
        />
        <Text variant="meta">{t('preferences.languageNote')}</Text>
      </Card>

      <Card title={t('preferences.units')}>
        <Text variant="label">{t('preferences.weight')}</Text>
        <SegmentedControl
          options={[
            { value: 'metric', label: t('preferences.kg') },
            { value: 'imperial', label: t('preferences.lb') },
          ]}
          value={settings?.units ?? 'metric'}
          onChange={(units) => updateSettings.mutate({ units: units as 'metric' | 'imperial' })}
          accessibilityLabel={t('preferences.weight')}
        />

        <Text variant="label">{t('preferences.energy')}</Text>
        <SegmentedControl
          options={[
            { value: 'kcal', label: t('preferences.kcal') },
            { value: 'kj', label: t('preferences.kj') },
          ]}
          value={settings?.energy ?? 'kcal'}
          onChange={(energy) => updateSettings.mutate({ energy: energy as 'kcal' | 'kj' })}
          accessibilityLabel={t('preferences.energy')}
        />
      </Card>

      <Card title={t('preferences.appearance')}>
        <SegmentedControl
          options={[
            { value: 'light', label: t('preferences.light') },
            { value: 'dark', label: t('preferences.dark') },
            { value: 'system', label: t('preferences.auto') },
          ]}
          value={preference}
          onChange={setPreference}
          accessibilityLabel={t('preferences.appearance')}
        />
      </Card>

      {/* No privacy card. "Share with family" and "Anonymous food data" were both
          switches over features that do not exist — there is nobody to share a
          diary with, and nothing collects anonymised food data — so each one was a
          promise the app cannot keep either way it is set. The columns stay in
          `user_settings`; dropping them is a migration, and a switch nobody can
          see cannot mislead anybody. */}
    </Screen>
  )
}
