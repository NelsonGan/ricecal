import { Image } from 'expo-image'
import * as Linking from 'expo-linking'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { radius, slab } from '@/theme/tokens'
import { Button, Icon, type IconProps, Sheet, Squish, Text, useToast } from '@/ui'
import { DISCORD_INVITE, DISCORD_LOGO } from './discord'

/**
 * Where help actually happens.
 *
 * There is no support inbox and no ticket form behind this: the whole of it is
 * a Discord server, so the row opens a sheet that says what is on the other
 * side and then hands over. An in-app form would be a second place to build and
 * a slower answer, and neither of us would be able to see what anybody else
 * asked.
 *
 * The invite and the mark moved to `discord.ts` when Share & Earn started
 * handing over to the same server. See the note there.
 */

export type HelpSheetProps = {
  visible: boolean
  onClose: () => void
}

/** What the server is for, one line each. */
const REASONS: readonly { key: 'bug' | 'idea' | 'ask'; icon: IconProps }[] = [
  { key: 'bug', icon: { set: 'system', name: 'bug' } },
  { key: 'idea', icon: { set: 'system', name: 'lightbulb' } },
  { key: 'ask', icon: { set: 'system', name: 'chat' } },
]

/**
 * HELP CENTRE — the offer to come and talk to us on Discord.
 *
 * A sheet rather than a screen because there is nothing to do here except
 * decide, and a pushed page with one button on it is a screen whose only
 * content is its own back chevron.
 */
export function HelpSheet({ visible, onClose }: HelpSheetProps) {
  const { t } = useTranslation(['profile', 'common'])
  const toast = useToast()

  /**
   * The sheet closes either way, and on the failure path that is the point
   * rather than a shrug: a `Sheet` is a native modal WINDOW, and the toast
   * renders in the app tree underneath it — fired with the sheet still up, the
   * explanation would be invisible behind the thing that needs explaining. So
   * this closes first and lets the toast land on the screen behind, which is
   * what `WeighInSheet` does for the same reason. Trying again is the same row
   * they just tapped.
   */
  const open = () => {
    Linking.openURL(DISCORD_INVITE).catch(() => {
      toast.show({ title: t('profile:help.failed'), tone: 'error' })
    })
    onClose()
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      /* Scrollable, which at this length looks unnecessary and is not. The
         content fits twice over at the default text size, but every string here
         scales with the OS font setting, and a body that cannot scroll clips
         what it cannot fit with no way to reach it. The buttons live in the
         footer, outside the scroll view, so they stay put whatever the text
         does. `FixSheet` turns this off for a reason that does not apply here:
         it raises the keyboard, and nothing in this sheet takes a field. */
      footer={
        <View className="gap-1">
          <Button fullWidth onPress={open}>
            {t('profile:help.action')}
          </Button>
          <Button variant="ghost" fullWidth onPress={onClose}>
            {t('common:action.close')}
          </Button>
        </View>
      }
    >
      <View className="items-center gap-2">
        {/* The mark, on the app's own raised plate.
            Every other illustration here is a claymorphic shape that carries
            its own edge; a flat vector on a transparent field floats, and next
            to them it reads as a rendering fault rather than as a logo. A
            border alone said "boxed"; `Squish` is what every raised thing in
            this app sits on, so the same slab says "tile" in the design's own
            vocabulary — and these are `StatTile`'s `track` colours exactly, so
            it matches the three tiles at the top of the screen behind it.
            Discord's guidance is the mark on a plain field, which is why the
            plate is the app's neutral rather than blurple.

            No `onPress`: it is a plate, not a control. `Squish` renders every
            layer regardless and declines the touch without a handler. */}
        <Squish
          depth={slab.md}
          radius={radius.tile}
          // `self-center`, not `Avatar`'s `self-start`: that one sits in a row,
          // this one in a centred column, and `self-start` overrides the
          // parent's `items-center` and parks the plate against the left edge.
          containerClassName="self-center"
          slabClassName="bg-line-strong"
          className="bg-track p-3.5"
        >
          <Image
            source={DISCORD_LOGO}
            style={{ width: 48, height: 48 }}
            contentFit="contain"
            // Bundled, so there is nothing to fade in from.
            transition={0}
            accessibilityLabel={t('profile:help.logo')}
          />
        </Squish>
        <Text variant="subtitle" className="text-center">
          {t('profile:help.title')}
        </Text>
        <Text variant="meta" className="text-center">
          {t('profile:help.body')}
        </Text>
      </View>

      <View className="gap-2.5">
        {REASONS.map((reason) => (
          <View key={reason.key} className="flex-row items-center gap-3">
            <Icon {...reason.icon} size={28} />
            <Text variant="body" className="min-w-0 flex-1">
              {t(`profile:help.${reason.key}`)}
            </Text>
          </View>
        ))}
      </View>
    </Sheet>
  )
}
