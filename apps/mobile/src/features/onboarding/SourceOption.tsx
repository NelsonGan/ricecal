import { Image } from 'expo-image'

import { cn, Icon, type IconProps, Squish, Text } from '@/ui'

/**
 * The bundled brand marks, keyed by the answer they belong to.
 *
 * Square app icons that carry their own background, so each fills a rounded
 * tile edge to edge rather than sitting on one. They came from Brandfetch (the
 * YouTube mark from Google's favicon service, which is the one Brandfetch had
 * no square icon for) and are committed rather than fetched: a logo grid that
 * needs the network is a grid of grey squares on the flakiest screen in the
 * flow.
 */
const LOGOS = {
  xiaohongshu: require('../../../assets/brands/social/xiaohongshu.png'),
  instagram: require('../../../assets/brands/social/instagram.png'),
  tiktok: require('../../../assets/brands/social/tiktok.jpg'),
  youtube: require('../../../assets/brands/social/youtube.png'),
  reddit: require('../../../assets/brands/social/reddit.jpg'),
  facebook: require('../../../assets/brands/social/facebook.png'),
  threads: require('../../../assets/brands/social/threads.jpg'),
  appStore: require('../../../assets/brands/social/appstore.jpg'),
  googlePlay: require('../../../assets/brands/social/googleplay.png'),
} as const

export type BrandLogo = keyof typeof LOGOS

const MARK = 36

export type SourceOptionProps = {
  label: string
  selected: boolean
  onPress: () => void
  /** A bundled brand mark, for the answers that are a platform. */
  logo?: BrandLogo
  /** The app's own illustration, for the answers that are not — friend, other. */
  icon?: IconProps
}

/**
 * One answer in the acquisition grid.
 *
 * A tile rather than a `ChoiceCard`, because of the count: eleven options is two
 * screens of full-width rows, and what a user scans for is a logo they recognise
 * rather than a sentence. Two columns puts every option in one screenful.
 *
 * Selection is the border and the fill, not a tick. With a recognisable mark in
 * every tile there is nowhere for a tick to go that is not on top of somebody's
 * trademark.
 */
export function SourceOption({ label, selected, onPress, logo, icon }: SourceOptionProps) {
  return (
    <Squish
      depth={5}
      radius={20}
      // `basis-[47%]` with `grow`, so two fit a row and a lone last tile
      // stretches rather than sitting half-width beside a gap.
      containerClassName="basis-[47%] grow"
      slabClassName={selected ? 'bg-water-soft-line' : 'bg-line'}
      className={cn(
        'h-[74px] flex-row items-center gap-3 border-[3px] px-3.5',
        selected ? 'border-water bg-water-soft' : 'border-line bg-surface',
      )}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      {logo ? (
        <Image
          source={LOGOS[logo]}
          style={{ width: MARK, height: MARK, borderRadius: 10 }}
          contentFit="cover"
          accessible={false}
        />
      ) : icon ? (
        <Icon {...icon} size={MARK} />
      ) : null}

      {/* Two lines, because "Friend or family" does not fit a half-width tile
          on a small phone and a truncated answer is one nobody picks. */}
      <Text variant="bodyStrong" numberOfLines={2} className="min-w-0 flex-1 text-[15px]">
        {label}
      </Text>
    </Squish>
  )
}
