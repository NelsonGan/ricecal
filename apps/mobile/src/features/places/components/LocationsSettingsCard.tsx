import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppState, View } from 'react-native'

import { useUserId } from '@/data'
import { ToggleRow } from '@/features/shared'
import { track } from '@/lib/analytics'
import {
  getLocationPermission,
  type LocationPermissionState,
  openLocationSettings,
  requestLocationPermission,
  setAutoTag,
  setLocationsEnabled,
  useLocationsPreference,
} from '@/lib/places'
import { Button, Card, Text } from '@/ui'

/**
 * Settings > Personalisation > Locations (README: Meal locations). Off by
 * default and stored per phone, since the permission it needs is the phone's.
 *
 * Turning it on asks for "while using the app" access. Refused, the card says
 * so with a way back: Allow while the system can still ask, Open Settings once
 * only the Settings app can. Search still works either way; only the current
 * location and the automatic tag need the permission.
 */
export function LocationsSettingsCard() {
  const { t } = useTranslation('places')
  const userId = useUserId()
  const { enabled, autoTag } = useLocationsPreference(userId)
  const [permission, setPermission] = useState<LocationPermissionState | null>(null)

  const refresh = useCallback(() => {
    void getLocationPermission().then(setPermission)
  }, [])

  // Again on the way back from the Settings app, where the answer may have changed.
  useEffect(() => {
    refresh()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => sub.remove()
  }, [refresh])

  const toggle = (next: boolean) => {
    setLocationsEnabled(userId, next)
    track('Locations Toggled', { enabled: next, source: 'settings' })
    if (next) void requestLocationPermission().then(setPermission)
  }

  // Refused, not merely unasked: while the system's own question is up the
  // answer is "undetermined", and a row saying access is off would be wrong.
  const refused = enabled && permission?.status === 'denied'

  return (
    <Card title={t('title')} contentClassName="gap-0">
      <ToggleRow
        title={t('enable')}
        description={t('enableHint')}
        value={enabled}
        onValueChange={toggle}
        divider={enabled}
      />
      {enabled ? (
        <ToggleRow
          title={t('autoTag')}
          description={t('autoTagHint')}
          value={autoTag}
          onValueChange={(next) => setAutoTag(userId, next)}
          divider={refused}
        />
      ) : null}
      {refused ? (
        <View className="flex-row items-center gap-3 py-2.5">
          <Text variant="label" className="min-w-0 flex-1">
            {t('accessOff')}
          </Text>
          <Button
            size="sm"
            variant="neutral"
            onPress={() =>
              permission?.canAskAgain
                ? void requestLocationPermission().then(setPermission)
                : void openLocationSettings()
            }
          >
            {permission?.canAskAgain ? t('allow') : t('openSettings')}
          </Button>
        </View>
      ) : null}
    </Card>
  )
}
