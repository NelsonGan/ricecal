import type { VideoPlatform } from '@/data'

/**
 * Whether some text holds a link to a post on a platform recipes can be
 * imported from, and which.
 *
 * Only enough to enable the Import button and name the platform. The server
 * parses the link properly (`_shared/video-link.ts`), follows share links and
 * decides which video it is; a link that passes here and not there comes back
 * as `unsupported_link`, which the import screen says in words.
 */

/** In the order the sheet lists them. */
export const VIDEO_PLATFORMS: readonly VideoPlatform[] = [
  'instagram',
  'tiktok',
  'youtube',
  'x',
  'threads',
  'facebook',
  'rednote',
]

const HOSTS: Array<[RegExp, VideoPlatform]> = [
  [/(^|\.)(instagram\.com|instagr\.am)$/, 'instagram'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)$/, 'x'],
  [/^t\.co$/, 'x'],
  [/(^|\.)threads\.(net|com)$/, 'threads'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.watch)$/, 'facebook'],
  [/(^|\.)(xiaohongshu\.com|xhslink\.com|rednote\.com)$/, 'rednote'],
]

export type FoundVideoLink = { platform: VideoPlatform; url: string }

/**
 * The first supported link in `text`. A share sheet and a pasted message both
 * hand over "Look at this! https://…", and a link copied out of a sentence
 * carries its full stop.
 */
// RFC 3986 ASCII URL characters only, matching SharedLink.swift and ShareLink.kt:
// Rednote's share copy puts a fullwidth comma and Chinese text immediately after
// the link with no space (`http://xhslink.com/a/AbC123，复制本条信息`).
const URL_IN_TEXT = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi
const BARE_URL =
  /^(?:www\.|m\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/i

export function findVideoLink(text: string | null | undefined): FoundVideoLink | null {
  if (!text) return null
  // A link typed by hand or copied out of a caption often has no scheme
  // ("instagram.com/reel/X"); the server reads those too.
  const trimmed = text.trim()
  const bare = BARE_URL.test(trimmed)
  const candidates = bare
    ? [`https://${trimmed}`]
    : Array.from(text.matchAll(URL_IN_TEXT), (m) => m[0])
  for (const candidate of candidates) {
    const raw = candidate.replace(/[).,!?;:'"\]]+$/, '')
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      continue
    }
    if (url.username || url.password) continue
    if (url.port && url.port !== '80' && url.port !== '443') continue
    const host = url.hostname.toLowerCase()
    const platform = HOSTS.find(([pattern]) => pattern.test(host))?.[1]
    if (platform) return { platform, url: raw }
  }
  return null
}
