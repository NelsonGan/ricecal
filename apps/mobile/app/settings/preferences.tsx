import { useTranslation } from 'react-i18next'
import { ToggleRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { type Privacy, useAppState, useDispatch } from '@/mock'
import { useTheme } from '@/theme/useTheme'
import { AppBar, Card, Screen, SegmentedControl, Text } from '@/ui'

/** U5 PREFERENCES */
export default function PreferencesScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const goBack = useBack('/me')
  const dispatch = useDispatch()
  // Appearance lives in the theme, not in the profile: one owner, so the toggle
  // and what is on screen can never disagree.
  const { preference, setPreference } = useTheme()
  const { profile, privacy } = useAppState((state) => ({
    profile: state.profile,
    privacy: state.privacy,
  }))

  const setPrivacy = (patch: Partial<Privacy>) => dispatch({ type: 'setPrivacy', patch })

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
          value={profile.language}
          // Only English is bundled, so this records the choice without
          // switching i18next to a locale that has no strings.
          onChange={(language) => dispatch({ type: 'updateProfile', patch: { language } })}
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
          value={profile.units}
          onChange={(units) => dispatch({ type: 'updateProfile', patch: { units } })}
          accessibilityLabel={t('preferences.weight')}
        />

        <Text variant="label">{t('preferences.energy')}</Text>
        <SegmentedControl
          options={[
            { value: 'kcal', label: t('preferences.kcal') },
            { value: 'kj', label: t('preferences.kj') },
          ]}
          value={profile.energy}
          onChange={(energy) => dispatch({ type: 'updateProfile', patch: { energy } })}
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
          value={privacy.shareWithFamily}
          onValueChange={(shareWithFamily) => setPrivacy({ shareWithFamily })}
        />
        <ToggleRow
          title={t('preferences.anonymousData')}
          value={privacy.anonymousFoodData}
          onValueChange={(anonymousFoodData) => setPrivacy({ anonymousFoodData })}
          divider={false}
        />
      </Card>
    </Screen>
  )
}
