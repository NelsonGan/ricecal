import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'
import { uploadAvatar, useEntitlement } from '@/data'
import { useRequirePro } from '@/features/paywall'
import { useThemeColors } from '@/theme/useTheme'
import { Badge, Icon, Tappable, Text, useToast } from '@/ui'
import { GROUP_ICONS, GroupIcon, PRO_GROUP_ICONS } from './parts'

/** What a group wears: a drawing, or a picture its leader uploaded. */
export type GroupIconChoice = {
  name: string
  /** The uploaded picture's key, when there is one. */
  path?: string | null
  /** The picture on this phone, drawn while the upload's own copy is signed. */
  localUri?: string
}

/** How many drawings the Pro section shows before View more, beside Upload. */
const PRO_PREVIEW = 6
/** One row of the free set, and of each Pro row. */
const PER_ROW = 7

/**
 * The free drawings in one row, then the Pro set: an upload tile and the
 * first six drawings, with the rest behind View more.
 *
 * A free account sees the Pro set locked. Tapping it explains and opens the
 * paywall, closing whatever sheet this sits in first (`beforePaywall`), since
 * the paywall opens under a sheet otherwise. Postgres refuses the same choices
 * for a free account (`group_check_icon`), so this is the honest button and
 * not the gate.
 */
export function GroupIconPicker({
  value,
  onChange,
  beforePaywall,
}: {
  value: GroupIconChoice
  onChange: (choice: GroupIconChoice) => void
  beforePaywall?: () => void
}) {
  const { t } = useTranslation('groups')
  const colors = useThemeColors()
  const toast = useToast()
  const { entitled } = useEntitlement()
  const requirePro = useRequirePro({ beforePaywall })
  const [expanded, setExpanded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const picture = value.path ? value : null
  const shownPro = expanded ? PRO_GROUP_ICONS : PRO_GROUP_ICONS.slice(0, PRO_PREVIEW)

  const choosePro = (name: string) => {
    if (!requirePro('group_icon')) return
    onChange({ name })
  }

  const upload = async () => {
    if (uploading || !requirePro('group_icon')) return
    setUploading(true)
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })
      const asset = result.canceled ? undefined : result.assets[0]
      if (!asset) return
      const path = await uploadAvatar(asset.uri)
      onChange({ name: value.name, path, localUri: asset.uri })
    } catch {
      toast.show({ title: t('iconUploadFailed'), tone: 'error' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <View className="gap-3">
      <Text variant="label">{t('icon')}</Text>
      <IconRow>
        {GROUP_ICONS.map((option, index) => (
          <IconTile
            key={option}
            selected={!picture && value.name === option}
            label={`${t('icon')} ${index + 1}`}
            onPress={() => onChange({ name: option })}
          >
            <GroupIcon name={option} size={32} />
          </IconTile>
        ))}
      </IconRow>

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Text variant="label">{t('proIcons')}</Text>
          <Badge tone="kaya" size="sm">
            Pro
          </Badge>
        </View>
        <Tappable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((open) => !open)}
        >
          <Text variant="meta" className="text-pandan">
            {expanded ? t('viewLess') : t('viewMore')}
          </Text>
        </Tappable>
      </View>
      {rows([UPLOAD, ...shownPro], PER_ROW).map((row) => (
        <IconRow key={row.join()}>
          {row.map((option) =>
            option === UPLOAD ? (
              <IconTile
                key={option}
                selected={Boolean(picture)}
                locked={!entitled}
                label={t('uploadIcon')}
                onPress={() => void upload()}
              >
                {uploading ? (
                  <ActivityIndicator color={colors.muted} />
                ) : picture?.localUri ? (
                  <Image
                    source={{ uri: picture.localUri }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : picture?.path ? (
                  <GroupIcon name={value.name} path={picture.path} size={32} fill />
                ) : (
                  <Icon set="ui" name="upload" size={26} tintColor={colors.muted} />
                )}
              </IconTile>
            ) : (
              <IconTile
                key={option}
                selected={!picture && value.name === option}
                locked={!entitled}
                label={`${t('icon')} ${option}`}
                onPress={() => choosePro(option)}
              >
                <GroupIcon name={option} size={32} />
              </IconTile>
            ),
          )}
        </IconRow>
      ))}
    </View>
  )
}

const UPLOAD = '__upload'

function rows<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Seven equal tiles across, whatever the width, so the free set is always one
 * row. A short last row keeps its tiles the same size as the rest.
 */
function IconRow({ children }: { children: React.ReactNode[] }) {
  const missing = Math.max(0, PER_ROW - children.length)
  return (
    <View className="flex-row gap-1.5">
      {children}
      {Array.from({ length: missing }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed spacers that never reorder
        <View key={index} className="flex-1" />
      ))}
    </View>
  )
}

function IconTile({
  selected,
  locked = false,
  label,
  onPress,
  children,
}: {
  selected: boolean
  locked?: boolean
  label: string
  onPress: () => void
  children: React.ReactNode
}) {
  const colors = useThemeColors()
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: locked }}
      accessibilityLabel={label}
      className={
        selected
          ? 'aspect-square flex-1 items-center justify-center overflow-hidden rounded-tile border-2 border-pandan bg-pandan-soft'
          : 'aspect-square flex-1 items-center justify-center overflow-hidden rounded-tile border border-line bg-surface'
      }
    >
      <View
        style={{ opacity: locked ? 0.45 : 1 }}
        className="h-full w-full items-center justify-center"
      >
        {children}
      </View>
      {locked ? (
        <View className="absolute bottom-0.5 right-0.5 h-4 w-4 items-center justify-center rounded-full bg-surface">
          <Icon set="system" name="lock" size={11} tintColor={colors.muted} />
        </View>
      ) : null}
    </Tappable>
  )
}
