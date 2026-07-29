import { useTranslation } from 'react-i18next'
import { useSettings, useUpdateSettings } from '@/data'
import { ToggleRow } from '@/features/shared'
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

      <Card title={t('preferences.privacy')} contentClassName="gap-0">
        <ToggleRow
          title={t('preferences.shareWithFamily')}
          value={settings?.share_with_family ?? false}
          onValueChange={(value) => updateSettings.mutate({ share_with_family: value })}
        />
        <ToggleRow
          title={t('preferences.anonymousData')}
          value={settings?.anonymous_food_data ?? false}
          onValueChange={(value) => updateSettings.mutate({ anonymous_food_data: value })}
          divider={false}
        />
      </Card>
    </Screen>
  )
}
