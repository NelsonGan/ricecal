/**
 * Where somebody would post about a food app, and how to get them there.
 *
 * THE LIST IS MALAYSIAN, not a copy of what another app in this account uses.
 * That one is a money app and its list leans on Reddit, which is where people
 * argue about budgeting; a plate of nasi lemak goes on Instagram, TikTok and
 * 小红书, and Facebook is still where the aunties are. Reddit is not here for
 * that reason alone — nothing is wrong with it, it is simply not where this
 * app's users photograph their food.
 *
 * EACH ENTRY IS A LADDER OF URLS, tried in order. The app's own scheme first,
 * because somebody who has Instagram installed wants Instagram and not a
 * logged-out web page, and the site last as the answer for a phone that does
 * not have it.
 *
 * NOTHING ASKS WHETHER THE APP IS INSTALLED — the ladder is walked by trying.
 * `canOpenURL` is gated behind a native manifest declaration on both platforms
 * and answers a flat "no" without one, which would send every tap to a browser
 * on a phone that has the app. See `openFirst` in the screen. What follows for
 * this list is that the LAST entry has to be openable by any phone at all,
 * which means a plain website and not a deep link into one.
 *
 * There is no compose intent in any of these. A post with a photograph in it
 * cannot be prefilled from outside the app on either platform, and a link that
 * opened an empty composer would be a worse start than the home screen, where
 * the user's own camera roll is one tap away.
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
