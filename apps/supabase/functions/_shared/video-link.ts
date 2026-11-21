// Which video a pasted or shared link names.
//
// Pure, so the whole matrix of link shapes is tested without the network. The
// one network step, following a short link to where it points, is
// `resolveShortLink` at the foot, and it only ever hands its answer back to
// `parseVideoLink`.
//
// Everything downstream keys on `{platform, id}`, never on the text: the same
// reel arrives as `/reel/X/?igsh=…`, `/p/X`, `/<user>/reel/X` and a share link
// that redirects to one of them, and the cache in `recipe_imports` would run
// the model once per spelling if the text were the key.

export type VideoPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'threads'
  | 'facebook'
  | 'rednote'

export const VIDEO_PLATFORMS: readonly VideoPlatform[] = [
  'instagram',
  'tiktok',
  'youtube',
  'x',
  'threads',
  'facebook',
  'rednote',
]

export type VideoLink = {
  platform: VideoPlatform
  /** The platform's own id for the post. The cache key, with the platform. */
  id: string
  /**
   * A link to the post rebuilt from the platform and the id, never the pasted
   * text, so it carries no tracking parameters and cannot point anywhere else.
   * This is the link shown to everybody as the credit.
   */
  canonicalUrl: string
  /**
   * Where to read the post from. Usually the canonical link; Rednote keeps the
   * share token its pages need (`xsec_token`), which is not part of the video's
   * identity and is not shown to anybody.
   */
  fetchUrl: string
  /** The author's handle when the link itself says it (TikTok, X, Threads). */
  handle?: string
}

/** A link that has to be followed before it says which video it is. */
export type ShortLink = { short: true; url: string; platform: VideoPlatform }

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/i

/**
 * The first link in whatever arrived. A share sheet hands over "Check out this
 * reel! https://…" as often as a bare link, and a link pasted from a message
 * has trailing punctuation.
 */
export function firstUrl(text: string): URL | null {
  const trimmed = text.trim()
  const match = trimmed.match(URL_IN_TEXT)
  // A bare host with no scheme ("instagram.com/reel/X") is how a link reads
  // when it was typed or copied out of a caption.
  const raw = match
    ? match[0]
    : /^(?:www\.|m\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S+$/i.test(trimmed)
      ? `https://${trimmed}`
      : null
  if (!raw) return null
  try {
    const url = new URL(raw.replace(/[).,!?;:'"\]]+$/, ''))
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

/** The host without `www.`, `m.` or `mobile.`, lower case. */
function bareHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(?:www|m|mobile|web)\./, '')
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/
const NUMERIC = /^\d{5,30}$/
const HANDLE = /^[A-Za-z0-9_.]{1,60}$/

function segments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean)
}

/** Hosts whose links only ever redirect to a post, never name one. */
const SHORT_HOSTS: Record<string, VideoPlatform> = {
  'vm.tiktok.com': 'tiktok',
  'vt.tiktok.com': 'tiktok',
  'fb.watch': 'facebook',
  'xhslink.com': 'rednote',
  't.co': 'x',
}

/**
 * Which video `text` names, a short link to follow first, or null when it is
 * no link of a platform this reads.
 */
export function parseVideoLink(text: string): VideoLink | ShortLink | null {
  const url = firstUrl(text)
  if (!url) return null
  const host = bareHost(url)
  const parts = segments(url)

  if (SHORT_HOSTS[url.hostname.toLowerCase()] || SHORT_HOSTS[host]) {
    return { short: true, url: url.toString(), platform: SHORT_HOSTS[host] }
  }

  if (host === 'instagram.com' || host === 'instagr.am') {
    // `/share/reel/<token>` and `/share/p/<token>` are share links that
    // redirect to the post; the token is not the post's code.
    if (parts[0] === 'share') return { short: true, url: url.toString(), platform: 'instagram' }
    // `/reel/X`, `/reels/X`, `/p/X`, `/tv/X`, and the same under `/<user>/`.
    const at = parts.findIndex((p) => ['reel', 'reels', 'p', 'tv'].includes(p))
    const code = at >= 0 ? parts[at + 1] : undefined
    if (!code || !SAFE_ID.test(code)) return null
    const kind = parts[at] === 'p' ? 'p' : 'reel'
    const canonicalUrl = `https://www.instagram.com/${kind}/${code}/`
    return { platform: 'instagram', id: code, canonicalUrl, fetchUrl: canonicalUrl }
  }

  if (host === 'tiktok.com') {
    // `/t/<code>` is the in-app share link.
    if (parts[0] === 't') return { short: true, url: url.toString(), platform: 'tiktok' }
    // `/@user/video/<id>` and `/@user/photo/<id>` (a slideshow, often a
    // recipe card), and the old `/v/<id>.html`.
    const at = parts.findIndex((p) => p === 'video' || p === 'photo')
    let id = at >= 0 ? parts[at + 1] : undefined
    if (!id && parts[0] === 'v' && parts[1]) id = parts[1].replace(/\.html$/, '')
    if (!id || !NUMERIC.test(id)) return null
    const user = parts[0]?.startsWith('@') ? parts[0].slice(1) : undefined
    const handle = user && HANDLE.test(user) ? user : undefined
    const kind = at >= 0 && parts[at] === 'photo' ? 'photo' : 'video'
    const canonicalUrl = `https://www.tiktok.com/@${handle ?? '_'}/${kind}/${id}`
    return { platform: 'tiktok', id, canonicalUrl, fetchUrl: canonicalUrl, handle }
  }

  if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') {
    let id: string | undefined
    let short = false
    if (host === 'youtu.be') id = parts[0]
    else if (parts[0] === 'watch') id = url.searchParams.get('v') ?? undefined
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) {
      id = parts[1]
      short = parts[0] === 'shorts'
    }
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null
    const canonicalUrl = short
      ? `https://www.youtube.com/shorts/${id}`
      : `https://www.youtube.com/watch?v=${id}`
    return { platform: 'youtube', id, canonicalUrl, fetchUrl: canonicalUrl }
  }

  if (
    host === 'x.com' ||
    host === 'twitter.com' ||
    host === 'fxtwitter.com' ||
    host === 'vxtwitter.com' ||
    host === 'fixupx.com'
  ) {
    const at = parts.indexOf('status')
    const id = at >= 0 ? parts[at + 1] : undefined
    if (!id || !NUMERIC.test(id)) return null
    const user = at > 0 ? parts[at - 1] : undefined
    const handle = user && HANDLE.test(user) && user !== 'i' ? user : undefined
    const canonicalUrl = `https://x.com/${handle ?? 'i'}/status/${id}`
    return { platform: 'x', id, canonicalUrl, fetchUrl: canonicalUrl, handle }
  }

  if (host === 'threads.net' || host === 'threads.com') {
    const at = parts.indexOf('post')
    const code = at >= 0 ? parts[at + 1] : undefined
    if (!code || !SAFE_ID.test(code)) return null
    const user = at > 0 && parts[at - 1].startsWith('@') ? parts[at - 1].slice(1) : undefined
    const handle = user && HANDLE.test(user) ? user : undefined
    const canonicalUrl = `https://www.threads.com/@${handle ?? '_'}/post/${code}`
    return { platform: 'threads', id: code, canonicalUrl, fetchUrl: canonicalUrl, handle }
  }

  if (host === 'facebook.com' || host === 'fb.com') {
    // `/share/r/<token>`, `/share/v/<token>`: share links that redirect.
    if (parts[0] === 'share') return { short: true, url: url.toString(), platform: 'facebook' }
    let id: string | undefined
    if (parts[0] === 'reel') id = parts[1]
    else if (parts[0] === 'watch') id = url.searchParams.get('v') ?? undefined
    else if (parts.includes('videos')) id = parts[parts.indexOf('videos') + 1]
    else if (parts[0] === 'video.php' || parts[0] === 'story.php') {
      id = url.searchParams.get('v') ?? url.searchParams.get('story_fbid') ?? undefined
    }
    if (!id || !NUMERIC.test(id)) return null
    const canonicalUrl = `https://www.facebook.com/reel/${id}`
    return { platform: 'facebook', id, canonicalUrl, fetchUrl: canonicalUrl }
  }

  if (host === 'xiaohongshu.com' || host === 'rednote.com') {
    // `/explore/<id>`, `/discovery/item/<id>`, `/user/profile/<user>/<id>`.
    const id = parts.find((p) => /^[0-9a-f]{24}$/i.test(p))
    if (!id) return null
    const canonicalUrl = `https://www.xiaohongshu.com/explore/${id}`
    // A note page answers only with the share token it was opened with, and
    // the token belongs to the link, not to the note.
    const token = url.searchParams.get('xsec_token')
    const fetchUrl = token
      ? `${canonicalUrl}?xsec_token=${encodeURIComponent(token)}&xsec_source=pc_share`
      : canonicalUrl
    return { platform: 'rednote', id: id.toLowerCase(), canonicalUrl, fetchUrl }
  }

  return null
}

/** Whether a parse result still needs following. */
export function isShortLink(link: VideoLink | ShortLink): link is ShortLink {
  return 'short' in link
}

/**
 * A short link followed to the post it names, by reading `Location` headers
 * ourselves rather than letting fetch follow them: a redirect chain that ends
 * on a login wall still told us the post in its second hop, and only the
 * platforms' own hosts are followed, so a short link cannot send this server
 * anywhere it likes.
 */
export async function resolveShortLink(
  link: ShortLink,
  fetcher: typeof fetch = fetch,
): Promise<VideoLink | null> {
  let current = link.url
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetcher(current, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'user-agent': BROWSER_UA, accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
    })
    // t.co answers a browser with a 200 page that redirects by a meta refresh
    // and only answers other clients with a 301, so a 200 is read for one.
    let location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel()
    } else if (res.ok) {
      location = metaRefresh(await readPrefix(res.body, 64 * 1024))
    } else {
      await res.body?.cancel()
      return null
    }
    if (!location) return null
    const next = new URL(location, current).toString()
    const parsed = parseVideoLink(next)
    if (!parsed) return null
    if (!isShortLink(parsed)) return parsed
    current = parsed.url
  }
  return null
}

/** The target of a `<meta http-equiv="refresh" content="0;URL=…">`, or null. */
export function metaRefresh(html: string): string | null {
  const tag = html.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/i)?.[0]
  const url = tag?.match(/content\s*=\s*["'][^"']*?url\s*=\s*([^"'\s>]+)/i)?.[1]
  return url ? url.replace(/&amp;/g, '&') : null
}

/** The first `max` bytes of a body as text, cancelling the rest. */
async function readPrefix(body: ReadableStream<Uint8Array> | null, max: number): Promise<string> {
  if (!body) return ''
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (size < max) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.length
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return new TextDecoder().decode(bytes.slice(0, max))
}

/** A current desktop browser, for pages that answer bots differently. */
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/18.0 Safari/605.1.15'
