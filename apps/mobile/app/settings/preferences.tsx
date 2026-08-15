import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings, useUpdateSettings } from '@/data'
import { useBack } from '@/lib/navigation'
import { useTheme } from '@/theme/useTheme'
import { AppBar, Card, Screen, SegmentedControl, Skeleton, Text } from '@/ui'

/** U5 PREFERENCES */
export default function PreferencesScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const goBack = useBack('/me')
  // Appearance lives in the theme, not in `user_settings`: one owner, so the
  // toggle and what is on screen can never disagree.
  const { preference, setPreference } = useTheme()
  const { data: settings, isPending } = useSettings()
  const updateSettings = useUpdateSettings()

  /**
   * A segmented control has a selected segment whatever it is given, so these
   * fell back to English, kg and kcal — three settings shown as chosen while
   * the row saying what was actually chosen was still on its way. Appearance is
   * not in here: the theme owns it, and it is right from the first frame.
   */
  const segment = (control: ReactNode) =>
    isPending ? <Skeleton className="h-[44px] w-full" /> : control

  return (
    <Screen>
      <AppBar
        title={t('preferences.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      {/* No language card. It offered English and Bahasa, and only English is
          bundled — so the control recorded a preference into `user_settings`
          and changed not one word on screen. A setting that appears to work and
          does nothing is worse than an absent one, and it was the first thing
          on the screen. The column stays where it is; dropping it is a
          migration, and a choice nobody can make cannot mislead anybody. Put
          the card back when there is a second bundle to switch to. */}

      <Card title={t('preferences.units')}>
        <Text variant="label">{t('preferences.weight')}</Text>
        {segment(
          <SegmentedControl
            options={[
              { value: 'metric', label: t('preferences.kg') },
              { value: 'imperial', label: t('preferences.lb') },
            ]}
            value={settings?.units ?? 'metric'}
            onChange={(units) => updateSettings.mutate({ units: units as 'metric' | 'imperial' })}
            accessibilityLabel={t('preferences.weight')}
          />,
        )}

        <Text variant="label">{t('preferences.energy')}</Text>
        {segment(
          <SegmentedControl
            options={[
              { value: 'kcal', label: t('preferences.kcal') },
              { value: 'kj', label: t('preferences.kj') },
            ]}
            value={settings?.energy ?? 'kcal'}
            onChange={(energy) => updateSettings.mutate({ energy: energy as 'kcal' | 'kj' })}
            accessibilityLabel={t('preferences.energy')}
          />,
        )}
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
