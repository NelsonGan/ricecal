/**
 * Where somebody would post about a food app, and how to get them there.
 *
 * The list is Malaysian: a plate of nasi lemak goes on Instagram, TikTok and
 * 小红书, and Facebook is still where the aunties are. Reddit is absent because
 * it is not where this app's users photograph their food.
 *
 * Each entry is a ladder of URLs tried in order, the app's own scheme first and
 * the site last, for a phone that does not have it.
 *
 * Nothing asks whether the app is installed: `canOpenURL` is gated behind a
 * native manifest declaration and answers a flat "no" without one, which would
 * send every tap to a browser. See `openFirst` in the screen. So the last entry
 * has to be openable by any phone, which means a plain website.
 *
 * No compose intent in any of these: a post with a photograph cannot be prefilled
 * from outside the app, and an empty composer is a worse start than the home
 * screen, where the camera roll is one tap away.
 */
export type SocialPlatform = {
  key: string
  /** Written out, not translated: these are proper nouns in every language. */
  label: string
  logo: number
  urls: readonly string[]
}

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    logo: require('../../../assets/brand/social/instagram.png'),
    urls: ['instagram://app', 'https://www.instagram.com'],
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    logo: require('../../../assets/brand/social/tiktok.jpg'),
    urls: ['snssdk1128://', 'https://www.tiktok.com'],
  },
  {
    key: 'xiaohongshu',
    label: '小红书',
    logo: require('../../../assets/brand/social/xiaohongshu.png'),
    urls: ['xhsdiscover://home', 'https://www.xiaohongshu.com'],
  },
  {
    key: 'facebook',
    label: 'Facebook',
    logo: require('../../../assets/brand/social/facebook.png'),
    urls: ['fb://', 'https://www.facebook.com'],
  },
  {
    key: 'threads',
    label: 'Threads',
    // "barcelona" is the Threads app's own scheme, from when it was a project
    // name rather than a product.
    logo: require('../../../assets/brand/social/threads.jpg'),
    urls: ['barcelona://', 'https://www.threads.com'],
  },
  {
    key: 'x',
    label: 'X',
    logo: require('../../../assets/brand/social/x.jpg'),
    // The site's front door, not `/compose/post`: a composer is a login wall to
    // anybody not signed in on the web, and the last rung of every ladder here
    // is the one that has to work for everybody.
    urls: ['twitter://post', 'https://x.com'],
  },
]
