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
export function findVideoLink(text: string | null | undefined): FoundVideoLink | null {
  if (!text) return null
  // A link typed by hand or copied out of a caption often has no scheme
  // ("instagram.com/reel/X"); the server reads those too.
  const trimmed = text.trim()
  const bare = /^(?:www\.|m\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S+$/i.test(trimmed)
  const candidates = bare
    ? [`https://${trimmed}`]
    : Array.from(text.matchAll(/https?:\/\/[^\s<>"'`]+/gi), (m) => m[0])
  for (const candidate of candidates) {
    const raw = candidate.replace(/[).,!?;:'"\]]+$/, '')
    let host: string
    try {
      host = new URL(raw).hostname.toLowerCase()
    } catch {
      continue
    }
    const platform = HOSTS.find(([pattern]) => pattern.test(host))?.[1]
    if (platform) return { platform, url: raw }
  }
  return null
}
