// What a post says about itself, read without an account.
//
// Each platform answers a different question to a server that is not signed
// in, so each has its own reader, and each takes only what that platform hands
// a link preview or a browser: no login, no cookies of our own, no pretending
// to be a search engine. What they can give:
//
//   platform    caption  cover  video          how
//   TikTok      yes      yes    yes + speech   the page's rehydration JSON
//   YouTube     yes      yes    by link        oEmbed and the watch page
//   X           yes      yes    yes            X's own embed endpoint
//   Facebook    yes      yes    yes            the page, as a browser asks
//   Instagram   yes      yes    no             link-preview meta tags
//   Threads     yes      yes    no             link-preview meta tags
//   Rednote     rarely   rarely no             blocked for servers outside China
//
// Most Instagram and Threads posts keep the recipe out of the caption ("link
// in bio"), so a recipe page the caption DOES link to is read too
// (`readLinkedRecipe`): a recipe site's schema.org card is the creator's own
// recipe, exact, and better than any reading of the video.
//
// Everything here is somebody else's page and is treated as data: parsed,
// bounded and never followed anywhere a platform did not send it.

import { readBoundedBytes } from './http.ts'
import { BROWSER_UA, type VideoLink, type VideoPlatform } from './video-link.ts'
import type { PostText } from './video-recipe.ts'

export type FetchedPost = PostText & {
  /** The link, with the handle filled in when the page said it. */
  link: VideoLink
  coverUrl: string | null
  /** A file the function can download, or for YouTube the watch link. */
  videoUrl: string | null
  /** Headers the video URL only answers with (TikTok signs it to the page's cookies). */
  videoHeaders?: Record<string, string>
}

/** The biggest video inlined for the model. Base64 makes it a third bigger again. */
export const MAX_VIDEO_BYTES = 18 * 1024 * 1024
const MAX_PAGE_BYTES = 4 * 1024 * 1024
const PAGE_TIMEOUT_MS = 10_000
const MEDIA_TIMEOUT_MS = 20_000
const LINKED_RECIPE_MS = 12_000

/**
 * The link-preview crawler's name. A preview is what this is, and it is the
 * one request Instagram, Threads and Facebook answer with the caption.
 */
const PREVIEW_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'

type Fetcher = typeof fetch

async function page(
  url: string,
  headers: Record<string, string>,
  fetcher: Fetcher,
): Promise<{ text: string; cookies: string } | null> {
  const res = await fetcher(url, {
    headers: { 'accept-language': 'en', accept: 'text/html,application/json', ...headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  })
  if (!res.ok) {
    await res.body?.cancel()
    return null
  }
  const bytes = await readBoundedBytes(res.body, MAX_PAGE_BYTES)
  // `getSetCookie` is the only way to read more than one Set-Cookie header.
  const cookies = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ')
  return { text: new TextDecoder().decode(bytes), cookies }
}

/** The page's post, or null when the platform would not say. */
export async function fetchPost(
  link: VideoLink,
  fetcher: Fetcher = fetch,
): Promise<FetchedPost | null> {
  const read = READERS[link.platform]
  const post = await read(link, fetcher)
  if (!post) return null
  // The recipe page the caption links to, if there is one. Never fatal.
  // Bounded as a whole: two links of four hops each could otherwise spend
  // most of the import's time on a page that is only a bonus.
  const linked = await Promise.race([
    readLinkedRecipe(post.caption ?? '', fetcher).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), LINKED_RECIPE_MS)),
  ])
  return { ...post, linkedRecipe: linked ?? post.linkedRecipe ?? null }
}

type Reader = (link: VideoLink, fetcher: Fetcher) => Promise<FetchedPost | null>

const READERS: Record<VideoPlatform, Reader> = {
  tiktok: readTikTok,
  youtube: readYouTube,
  x: readX,
  facebook: readFacebook,
  instagram: (link, fetcher) => readPreview(link, fetcher),
  threads: (link, fetcher) => readPreview(link, fetcher),
  rednote: readRednote,
}

function base(link: VideoLink): FetchedPost {
  return {
    link,
    platform: link.platform,
    author: link.handle ? `@${link.handle}` : null,
    title: null,
    caption: null,
    transcript: null,
    linkedRecipe: null,
    coverUrl: null,
    videoUrl: null,
  }
}

// -- Meta tags ---------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
}

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X'
          ? Number.parseInt(code.slice(2), 16)
          : Number(code.slice(1))
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })
}

/** Every `og:` and `twitter:` meta tag, by property, first one winning. */
export function metaTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {}
  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = match[0]
    const key = tag.match(/(?:property|name)\s*=\s*"([^"]+)"/i)?.[1]?.toLowerCase()
    const content = tag.match(/content\s*=\s*"([^"]*)"/i)?.[1]
    if (key && content !== undefined && !(key in tags)) tags[key] = decodeEntities(content)
  }
  return tags
}

/**
 * The caption out of Instagram's and Threads' preview description, which
 * wraps it: `3,826 likes, 233 comments - pinchofnom on January 18, 2023:
 * "FAJITA BOMBS…"`, or for a title `Pinch of Nom on Instagram: "…"`.
 */
export function unwrapPreviewCaption(text: string | undefined): string | null {
  if (!text) return null
  const quoted = text.match(/:\s*"([\s\S]*)"\s*\.?\s*$/)
  return (quoted ? quoted[1] : text).trim() || null
}

/** Instagram and Threads: the preview a link unfurls into. */
async function readPreview(link: VideoLink, fetcher: Fetcher): Promise<FetchedPost | null> {
  const got = await page(link.fetchUrl, { 'user-agent': PREVIEW_UA }, fetcher)
  if (!got) return null
  const tags = metaTags(got.text)
  const caption =
    unwrapPreviewCaption(tags['og:description']) ?? unwrapPreviewCaption(tags['og:title'])
  if (!caption && !tags['og:image']) return null

  const post = base(link)
  // The handle is in the canonical URL the page gives (`/pinchofnom/reel/X/`,
  // `/@pinchofnom/post/X`), or before " on " in the description.
  const url = tags['og:url'] ?? ''
  const handle =
    url.match(/instagram\.com\/([A-Za-z0-9_.]{1,60})\/(?:reel|p|tv)\//)?.[1] ??
    url.match(/threads\.(?:net|com)\/@([A-Za-z0-9_.]{1,60})\//)?.[1] ??
    tags['og:description']?.match(/-\s*([A-Za-z0-9_.]{1,60})\s+on\s/)?.[1]
  if (handle) {
    post.author = `@${handle}`
    post.link = { ...link, handle }
    if (link.platform === 'threads') {
      post.link.canonicalUrl = `https://www.threads.com/@${handle}/post/${link.id}`
    }
  }
  post.caption = caption
  post.title =
    tags['og:title']?.replace(/\s+on (?:Instagram|Threads)(?::[\s\S]*)?$/, '').trim() || null
  post.coverUrl = httpsOrNull(tags['og:image'])
  post.videoUrl = httpsOrNull(tags['og:video'] ?? tags['og:video:secure_url'])
  return post
}

// -- TikTok -------------------------------------------------------------------

type TikTokItem = {
  desc?: string
  author?: { uniqueId?: string; nickname?: string }
  video?: {
    cover?: string
    originCover?: string
    playAddr?: string
    downloadAddr?: string
    subtitleInfos?: Array<{ Url?: string; LanguageCodeName?: string; Format?: string }>
    duration?: number
    bitrateInfo?: Array<{
      Bitrate?: number
      CodecType?: string
      PlayAddr?: { UrlList?: string[] }
    }>
  }
  imagePost?: { cover?: { imageURL?: { urlList?: string[] } } }
}

/** The JSON a TikTok page hydrates from. Exported for its test. */
export function tiktokItem(html: string): TikTokItem | null {
  const raw = html.match(
    /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
  )?.[1]
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    return data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct ?? null
  } catch {
    return null
  }
}

async function readTikTok(link: VideoLink, fetcher: Fetcher): Promise<FetchedPost | null> {
  const got = await page(link.fetchUrl, { 'user-agent': BROWSER_UA }, fetcher)
  if (!got) return null
  const item = tiktokItem(got.text)
  if (!item) return null

  const post = base(link)
  const handle = item.author?.uniqueId
  if (handle && /^[A-Za-z0-9_.]{1,60}$/.test(handle)) {
    post.author = `@${handle}`
    const kind = link.canonicalUrl.includes('/photo/') ? 'photo' : 'video'
    post.link = {
      ...link,
      handle,
      canonicalUrl: `https://www.tiktok.com/@${handle}/${kind}/${link.id}`,
    }
  }
  post.caption = item.desc?.trim() || null
  post.coverUrl =
    httpsOrNull(item.video?.cover ?? item.video?.originCover) ??
    httpsOrNull(item.imagePost?.cover?.imageURL?.urlList?.[0])

  // The file is signed to the page's own cookies, so it is fetched with them
  // and the page as the referrer, exactly as the page itself would.
  post.videoUrl =
    smallestTikTokVideo(item) ?? httpsOrNull(item.video?.playAddr ?? item.video?.downloadAddr)
  if (post.videoUrl) {
    post.videoHeaders = {
      'user-agent': BROWSER_UA,
      referer: 'https://www.tiktok.com/',
      ...(got.cookies ? { cookie: got.cookies } : {}),
    }
  }

  // TikTok writes out what is said in the video, and it downloads without a
  // session: the recipe is often spoken rather than captioned, and this is it.
  const subtitle =
    item.video?.subtitleInfos?.find((s) => s.LanguageCodeName?.startsWith('eng')) ??
    item.video?.subtitleInfos?.[0]
  const subtitleUrl = httpsOrNull(subtitle?.Url)
  if (subtitleUrl) {
    const vtt = await page(subtitleUrl, { 'user-agent': BROWSER_UA }, fetcher).catch(() => null)
    if (vtt) post.transcript = transcriptFromVtt(vtt.text)
  }
  return post
}

/**
 * The cheapest copy of a TikTok that still fits what the model is sent. The
 * default file is the best quality, and a two-minute reel at 1080p is over
 * `MAX_VIDEO_BYTES` (a 20 MB birthday dinner fell back to its caption), while
 * a recipe reads as well at 540p. H.264 first, because every video model
 * decodes it; HEVC only if nothing else fits. Sizes are estimated from the
 * bitrate and the length, since TikTok rarely says the size. Exported for its
 * test.
 */
export function smallestTikTokVideo(item: TikTokItem): string | null {
  const seconds = item.video?.duration ?? 0
  const variants = (item.video?.bitrateInfo ?? [])
    .map((v) => ({
      url: httpsOrNull(v.PlayAddr?.UrlList?.[0]),
      h264: (v.CodecType ?? '').startsWith('h264'),
      bytes: ((v.Bitrate ?? 0) * seconds) / 8,
    }))
    .filter((v): v is { url: string; h264: boolean; bytes: number } => v.url !== null)
  const fits = (v: { bytes: number }) =>
    seconds > 0 && v.bytes > 0 && v.bytes <= MAX_VIDEO_BYTES * 0.9
  const smallest = (list: typeof variants) =>
    [...list].sort((a, b) => a.bytes - b.bytes)[0]?.url ?? null
  return smallest(variants.filter((v) => v.h264 && fits(v))) ?? smallest(variants.filter(fits))
}

/** The words of a WebVTT file, without its cue timings. */
export function transcriptFromVtt(vtt: string): string | null {
  const lines = vtt
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l !== 'WEBVTT' && !l.includes('-->') && !/^\d+$/.test(l))
  const text = lines.join(' ').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 6000) : null
}

// -- YouTube ------------------------------------------------------------------

async function readYouTube(link: VideoLink, fetcher: Fetcher): Promise<FetchedPost | null> {
  const post = base(link)
  // oEmbed for the title, the channel and the cover: the documented route, and
  // the one least likely to be refused.
  const oembed = await page(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link.canonicalUrl)}`,
    { 'user-agent': BROWSER_UA },
    fetcher,
  ).catch(() => null)
  if (oembed) {
    try {
      const o = JSON.parse(oembed.text) as {
        title?: string
        author_name?: string
        thumbnail_url?: string
      }
      post.title = o.title?.trim() || null
      post.author = o.author_name?.trim() || null
      post.coverUrl = httpsOrNull(o.thumbnail_url)
    } catch {
      // Fall through to the watch page.
    }
  }
  // The description, which oEmbed leaves out and which is where a cooking
  // channel writes its ingredients, is in the watch page's player response.
  const watch = await page(link.canonicalUrl, { 'user-agent': BROWSER_UA }, fetcher).catch(
    () => null,
  )
  if (watch) {
    const description = watch.text.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1]
    if (description) {
      try {
        post.caption = (JSON.parse(`"${description}"`) as string).trim() || null
      } catch {
        // A description that will not decode is one we do without.
      }
    }
  }
  if (!post.title && !post.caption) return null
  post.coverUrl ??= `https://i.ytimg.com/vi/${link.id}/hqdefault.jpg`
  // The video model fetches YouTube itself, by the watch link.
  post.videoUrl = link.canonicalUrl
  return post
}

// -- X ------------------------------------------------------------------------

/**
 * The token X's embed endpoint asks for, which its own embed script works out
 * from the post id. Any value is accepted today; this is the one it sends.
 */
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
}

async function readX(link: VideoLink, fetcher: Fetcher): Promise<FetchedPost | null> {
  const got = await page(
    `https://cdn.syndication.twimg.com/tweet-result?id=${link.id}&token=${syndicationToken(link.id)}&lang=en`,
    { 'user-agent': BROWSER_UA },
    fetcher,
  )
  if (!got) return null
  let t: {
    text?: string
    user?: { screen_name?: string; name?: string }
    mediaDetails?: Array<{
      media_url_https?: string
      video_info?: { variants?: Array<{ content_type?: string; url?: string; bitrate?: number }> }
    }>
  }
  try {
    t = JSON.parse(got.text)
  } catch {
    return null
  }
  if (!t.text) return null

  const post = base(link)
  const handle = t.user?.screen_name
  if (handle && /^[A-Za-z0-9_]{1,30}$/.test(handle)) {
    post.author = `@${handle}`
    post.link = { ...link, handle, canonicalUrl: `https://x.com/${handle}/status/${link.id}` }
  }
  // A post's text ends in a t.co link to its own media; it says nothing.
  post.caption = t.text.replace(/\s*https:\/\/t\.co\/\w+\s*$/, '').trim() || null
  const media = t.mediaDetails?.find((m) => m.video_info) ?? t.mediaDetails?.[0]
  post.coverUrl = httpsOrNull(media?.media_url_https)
  // The smallest mp4 is plenty for reading a recipe, and the cheapest to send.
  const mp4 = (media?.video_info?.variants ?? [])
    .filter((v) => v.content_type === 'video/mp4' && v.url)
    .sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0))
  post.videoUrl = httpsOrNull(mp4[0]?.url)
  return post
}

// -- Facebook -----------------------------------------------------------------

/** A JSON string value out of a page, decoded. Exported for its test. */
export function jsonString(html: string, pattern: RegExp): string | null {
  const raw = html.match(pattern)?.[1]
  if (!raw) return null
  try {
    return (JSON.parse(`"${raw}"`) as string).trim() || null
  } catch {
    return null
  }
}

const STRING = '((?:[^"\\\\]|\\\\.)*)'

async function readFacebook(link: VideoLink, fetcher: Fetcher): Promise<FetchedPost | null> {
  // Asked the way a browser opening the link asks, which is what puts the
  // video's own data in the page; the preview crawler gets only the tags.
  const got = await page(
    link.fetchUrl,
    {
      'user-agent': BROWSER_UA,
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-dest': 'document',
    },
    fetcher,
  )
  if (!got) return null
  const html = got.text
  const tags = metaTags(html)
  const post = base(link)
  post.caption =
    jsonString(html, new RegExp(`"message":\\{"text":"${STRING}"`)) ??
    tags['og:description'] ??
    null
  post.title = tags['og:title'] ?? null
  post.author = jsonString(html, new RegExp(`"video_owner":\\{[^{}]*?"name":"${STRING}"`)) ?? null
  post.coverUrl =
    httpsOrNull(
      jsonString(html, new RegExp(`"preferred_thumbnail":\\{"image":\\{"uri":"${STRING}"`)),
    ) ?? httpsOrNull(tags['og:image'])
  post.videoUrl =
    httpsOrNull(jsonString(html, new RegExp(`"browser_native_sd_url":"${STRING}"`))) ??
    httpsOrNull(jsonString(html, new RegExp(`"browser_native_hd_url":"${STRING}"`)))
  if (!post.caption && !post.title && !post.videoUrl) return null
  return post
}

// -- Rednote ------------------------------------------------------------------

async function readRednote(link: VideoLink, fetcher: Fetcher): Promise<FetchedPost | null> {
  const got = await page(link.fetchUrl, { 'user-agent': BROWSER_UA }, fetcher)
  if (!got) return null
  const post = base(link)
  // The note's own state, when the page is willing to hand it over.
  const state = got.text.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)?.[1]
  if (state) {
    try {
      const data = JSON.parse(state.replace(/\bundefined\b/g, 'null'))
      const note = data?.note?.noteDetailMap?.[link.id]?.note
      if (note) {
        post.title = typeof note.title === 'string' ? note.title.trim() || null : null
        post.caption = typeof note.desc === 'string' ? note.desc.trim() || null : null
        post.author = typeof note.user?.nickname === 'string' ? note.user.nickname : null
        post.coverUrl = httpsOrNull(note.imageList?.[0]?.urlDefault)
        const stream = note.video?.media?.stream
        const variant = stream?.h264?.[0] ?? stream?.h265?.[0]
        post.videoUrl = httpsOrNull(variant?.masterUrl)
      }
    } catch {
      // A state blob that will not parse is the same as none.
    }
  }
  if (!post.caption && !post.title) {
    const tags = metaTags(got.text)
    post.title = tags['og:title'] ?? null
    post.caption = tags['og:description'] ?? tags.description ?? null
    post.coverUrl = httpsOrNull(tags['og:image'])
  }
  // Rednote's error and login pages carry its own generic title.
  if (!post.caption && (!post.title || /小红书|rednote/i.test(post.title))) return null
  return post
}

// -- A recipe page the caption links to ----------------------------------------

/** Hosts a caption links to that are never a recipe card. */
const NOT_RECIPE_HOSTS =
  /(?:^|\.)(?:instagram\.com|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|t\.co|threads\.(?:net|com)|facebook\.com|fb\.watch|linktr\.ee|beacons\.ai|amzn\.to|amazon\.[a-z.]+|bit\.ly|xiaohongshu\.com|xhslink\.com|spotify\.com|apple\.com|ltk\.app|shopmy\.us|patreon\.com)$/i

/**
 * Whether a host may be fetched. Public DNS names only: no IP literals, no
 * single-label names and nothing local, because the URL came out of a stranger's
 * caption and this function runs on our network.
 */
export function isFetchableHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (!host.includes('.')) return false
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return false
  if (/(?:^|\.)(?:localhost|local|internal|lan|home|arpa)$/.test(host)) return false
  return true
}

/** Candidate recipe links in a caption, in order. Exported for its test. */
export function recipeLinks(caption: string): URL[] {
  const out: URL[] = []
  for (const match of caption.matchAll(/https?:\/\/[^\s<>"'`)\]]+/gi)) {
    try {
      const url = new URL(match[0].replace(/[.,!?;:]+$/, ''))
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
      if (!isFetchableHost(url.hostname) || NOT_RECIPE_HOSTS.test(url.hostname)) continue
      // A bare domain is a shop or a home page; a recipe has a path.
      if (url.pathname.length <= 1) continue
      out.push(url)
    } catch {
      // Not a URL after all.
    }
  }
  return out.slice(0, 2)
}

type LdRecipe = {
  name?: unknown
  recipeYield?: unknown
  recipeIngredient?: unknown
  recipeInstructions?: unknown
  prepTime?: unknown
  cookTime?: unknown
}

/** The schema.org Recipe in a page's JSON-LD, wherever it is nested. */
export function ldRecipe(html: string): LdRecipe | null {
  for (const match of html.matchAll(
    /<script[^>]+type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data: unknown
    try {
      data = JSON.parse(match[1].trim())
    } catch {
      continue
    }
    const stack: unknown[] = [data]
    while (stack.length) {
      const node = stack.pop()
      if (Array.isArray(node)) stack.push(...node)
      else if (node && typeof node === 'object') {
        const o = node as Record<string, unknown>
        const type = o['@type']
        if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe')))
          return o as LdRecipe
        if (o['@graph']) stack.push(o['@graph'])
      }
    }
  }
  return null
}

const words = (value: unknown): string =>
  typeof value === 'string'
    ? decodeEntities(value.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
    : ''

/** The steps of a schema.org recipe, which come as strings, steps or sections. */
function instructions(value: unknown): string[] {
  if (typeof value === 'string') return [words(value)].filter(Boolean)
  if (!Array.isArray(value)) return []
  return value.flatMap((step) => {
    if (typeof step === 'string') return [words(step)].filter(Boolean)
    const o = (step ?? {}) as Record<string, unknown>
    if (Array.isArray(o.itemListElement)) return instructions(o.itemListElement)
    return [words(o.text ?? o.name)].filter(Boolean)
  })
}

/** A schema.org recipe as plain text for the model. Exported for its test. */
export function ldRecipeText(recipe: LdRecipe): string | null {
  const ingredients = Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient.map(words).filter(Boolean).slice(0, 40)
    : []
  if (ingredients.length === 0) return null
  const yieldText = Array.isArray(recipe.recipeYield)
    ? words(recipe.recipeYield[0])
    : words(String(recipe.recipeYield ?? ''))
  const steps = instructions(recipe.recipeInstructions).slice(0, 30)
  const lines = [
    `Name: ${words(recipe.name) || '(none)'}`,
    yieldText ? `Serves: ${yieldText}` : null,
    words(recipe.prepTime) ? `Prep time: ${words(recipe.prepTime)}` : null,
    words(recipe.cookTime) ? `Cook time: ${words(recipe.cookTime)}` : null,
    'Ingredients:',
    ...ingredients.map((i) => `- ${i}`),
    steps.length ? 'Method:' : null,
    ...steps.map((s, i) => `${i + 1}. ${s}`),
  ].filter((l): l is string => l !== null)
  return lines.join('\n').slice(0, 6000)
}

/**
 * The recipe on a page the caption links to, as text, or null. Redirects are
 * followed by hand so every hop is checked against `isFetchableHost`.
 */
export async function readLinkedRecipe(
  caption: string,
  fetcher: Fetcher = fetch,
  resolves: (host: string) => Promise<boolean> = resolvesPublicly,
): Promise<string | null> {
  for (const start of recipeLinks(caption)) {
    let url = start
    for (let hop = 0; hop < 4; hop++) {
      // A public name can still point at a private address (`10.0.0.1.nip.io`,
      // or a stranger's domain with an A record of 169.254.169.254), so every
      // hop's name is resolved and checked before anything is sent to it.
      if (!(await resolves(url.hostname))) break
      const res = await fetcher(url.toString(), {
        headers: { 'user-agent': BROWSER_UA, accept: 'text/html', 'accept-language': 'en' },
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
      }).catch(() => null)
      if (!res) break
      const location = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel()
        const next = new URL(location, url)
        if (!isFetchableHost(next.hostname) || !/^https?:$/.test(next.protocol)) break
        url = next
        continue
      }
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) {
        await res.body?.cancel()
        break
      }
      const html = new TextDecoder().decode(
        await readBoundedBytes(res.body, MAX_PAGE_BYTES).catch(() => new Uint8Array()),
      )
      const recipe = ldRecipe(html)
      const text = recipe ? ldRecipeText(recipe) : null
      if (text) return text
      break
    }
  }
  return null
}

/** Whether an address is loopback, private, link-local, CGNAT or otherwise not the internet. */
export function isPrivateAddress(address: string): boolean {
  const a = address.toLowerCase()
  if (a.includes(':')) {
    // IPv6: loopback, unspecified, unique local, link local, and v4-mapped.
    if (a === '::1' || a === '::') return true
    if (/^f[cd]/.test(a) || /^fe[89ab]/.test(a)) return true
    const mapped = a.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
    return mapped ? isPrivateAddress(mapped) : false
  }
  const [p, q] = a.split('.').map(Number)
  return (
    p === 0 ||
    p === 10 ||
    p === 127 ||
    (p === 100 && q >= 64 && q <= 127) ||
    (p === 169 && q === 254) ||
    (p === 172 && q >= 16 && q <= 31) ||
    (p === 192 && q === 168) ||
    (p === 198 && (q === 18 || q === 19)) ||
    p >= 224
  )
}

/**
 * Whether every address a host name resolves to is on the public internet.
 * Refuses a name that does not resolve. Where the runtime offers no resolver
 * at all it answers yes, since the name itself has already passed
 * `isFetchableHost`; the edge runtime has one.
 */
export async function resolvesPublicly(host: string): Promise<boolean> {
  const resolve = (Deno as unknown as { resolveDns?: typeof Deno.resolveDns }).resolveDns
  if (typeof resolve !== 'function') return true
  const answers = await Promise.all([
    resolve(host, 'A').catch(() => [] as string[]),
    resolve(host, 'AAAA').catch(() => [] as string[]),
  ])
  const addresses = answers.flat()
  return addresses.length > 0 && !addresses.some(isPrivateAddress)
}

// -- Media --------------------------------------------------------------------

function httpsOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && isFetchableHost(url.hostname) ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * A cover or a video, bounded, and only of the kind asked for: a platform that
 * answers an image URL with an HTML error page must not have that page sent to
 * a model as a photo.
 */
export async function fetchMedia(
  url: string,
  maxBytes: number,
  typePrefix: 'image/' | 'video/',
  headers: Record<string, string> = { 'user-agent': BROWSER_UA },
  fetcher: Fetcher = fetch,
): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const res = await fetcher(url, { headers, signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS) })
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const length = Number(res.headers.get('content-length') ?? 0)
    if (!res.ok || !type.startsWith(typePrefix) || length > maxBytes) {
      await res.body?.cancel()
      return null
    }
    return { bytes: await readBoundedBytes(res.body, maxBytes), type }
  } catch (error) {
    console.warn(
      `[video-post] ${typePrefix} not fetched:`,
      error instanceof Error ? error.message : error,
    )
    return null
  }
}
