import * as Clipboard from 'expo-clipboard'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Button, TextField } from '@/ui'
import { PlatformLogo } from './PlatformLogo'
import { findVideoLink, VIDEO_PLATFORMS } from './videoLink'

export type ImportVideoPanelProps = {
  /** The link to import. Only ever called with one `findVideoLink` accepted. */
  onSubmit: (url: string) => void
  autoFocus?: boolean
}

/**
 * Pasting a link to a cooking video, in the sheet behind the Recipes tab's
 * plus. The other way in is the share sheet, which skips this and opens
 * `/recipe/import` directly.
 *
 * Paste is a button beside the field rather than a read of the clipboard when
 * the sheet opens: iOS asks permission for every read the user did not start,
 * and a sheet that opens with a system alert over it reads as the app snooping.
 *
 * The platforms are shown under the field because "a video" alone does not say
 * which apps' links work, and a link from one that does not is the likeliest
 * way this goes wrong. Logos, because a logo is what somebody looks for, and
 * the same tile marks the recipe once it is made. Once a link is pasted, its
 * platform stays lit and the rest step back.
 */
export function ImportVideoPanel({ onSubmit, autoFocus = false }: ImportVideoPanelProps) {
  const { t } = useTranslation(['recipes', 'common'])
  const [text, setText] = useState('')
  const found = findVideoLink(text)
  // Only once something is there that is not a link we read: an empty field
  // is not a mistake.
  const wrong = text.trim().length > 0 && !found

  const paste = async () => {
    const copied = await Clipboard.getStringAsync().catch(() => '')
    if (copied) setText(findVideoLink(copied)?.url ?? copied.trim())
  }

  return (
    <View className="gap-4">
      <TextField
        value={text}
        onChangeText={setText}
        placeholder={t('recipes:import.placeholder')}
        accessibilityLabel={t('recipes:import.placeholder')}
        error={wrong ? t('recipes:import.unsupported') : undefined}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        textContentType="URL"
        onSubmitEditing={() => found && onSubmit(found.url)}
        rightSlot={
          <Button size="sm" variant="secondary" onPress={paste}>
            {t('recipes:import.paste')}
          </Button>
        }
      />

      {/* The apps whose links work, as their logos alone: a row of seven names
          under them was the busiest thing in the sheet, and each logo says its
          name better than the word does. */}
      <View
        className="flex-row justify-between px-1"
        accessible
        accessibilityLabel={`${t('recipes:import.worksWith')}: ${VIDEO_PLATFORMS.map((p) =>
          t(`recipes:platform.${p}`),
        ).join(', ')}`}
      >
        {VIDEO_PLATFORMS.map((platform) => (
          <View
            key={platform}
            testID={`works-with-${platform}`}
            accessibilityState={{ selected: found?.platform === platform }}
            style={{ opacity: !found || found.platform === platform ? 1 : 0.3 }}
          >
            <PlatformLogo platform={platform} size={30} />
          </View>
        ))}
      </View>

      <Button fullWidth disabled={!found} onPress={() => found && onSubmit(found.url)}>
        {t('recipes:import.action')}
      </Button>
    </View>
  )
}
