import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { EntryLocation } from '@/data'
import { useThemeColors } from '@/theme/useTheme'
import { Card, Icon, Spinner, Tappable, Text } from '@/ui'

import { placeCategoryIcon } from '../lib/placeIcons'
import { regionAround } from '../lib/placeLocation'
import { AppMap, mapsModule } from './AppMap'

/**
 * Where a meal was eaten, on the entry page (README: Meal locations): the
 * place's name and address beside a small still map of the spot, and the way
 * into the picker. With no place yet it is one row offering to add one;
 * `resolving` is the automatic tag still on its way for a meal being composed.
 */
export function LocationCard({
  location,
  resolving = false,
  onPress,
}: {
  location: EntryLocation | null
  resolving?: boolean
  onPress: () => void
}) {
  const { t } = useTranslation('places')
  const maps = mapsModule()
  const colors = useThemeColors()

  return (
    <Card>
      <Tappable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          location
            ? [t('where'), location.name, location.address].filter(Boolean).join(', ')
            : t('add')
        }
        className="flex-row items-center gap-md"
      >
        <View className="h-11 w-11 items-center justify-center">
          {resolving && !location ? (
            <Spinner />
          ) : (
            <Icon {...placeCategoryIcon(location?.category)} size={34} />
          )}
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="caption">{t('where')}</Text>
          <Text variant="label" numberOfLines={2}>
            {location ? location.name : t('add')}
          </Text>
          {location?.address ? (
            <Text variant="meta" numberOfLines={1}>
              {location.address}
            </Text>
          ) : null}
        </View>
        {location && maps ? (
          // A picture of the spot, not a control: the whole card is the button.
          <View
            className="h-[72px] w-[92px] overflow-hidden rounded-sm border-2 border-line"
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <AppMap
              key={`${location.latitude},${location.longitude}`}
              still
              initialRegion={regionAround(location)}
            >
              <maps.Marker
                coordinate={{ latitude: location.latitude, longitude: location.longitude }}
                tracksViewChanges={false}
              >
                <Icon set="ui" name="location" size={26} />
              </maps.Marker>
            </AppMap>
          </View>
        ) : (
          <Icon set="ui" name="chevron-right" size={20} tintColor={colors.faint} />
        )}
      </Tappable>
    </Card>
  )
}
