// What a post says about itself, read without an account.
//
// Each platform answers a different question to a server that is not signed
// in, so each has its own reader, and each takes only what that platform hands
// a link preview or a browser: no login, no cookies of our own, no pretending
// to be a search engine. What they can give:
//
//   platform    caption  cover  video          how
//   TikTok      yes      yes    yes + speech   the page's rehydration JSON
//   YouTube     yes      yes    no             oEmbed and the watch page
//   X           yes      yes    yes            X's own embed endpoint
//   Facebook    yes      yes    yes            the page, as a browser asks
//   Instagram   yes      yes    no             link-preview meta tags, /media
//   Threads     yes      card   no             link-preview meta tags
//   Rednote     yes      yes    yes            the note page's state, as a browser asks
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
  /** Where to look when `coverUrl` does not answer with a picture. */
  coverFallbackUrl?: string | null
  /**
   * The cover is a rendering of the post rather than a frame of the video:
   * fine for the model to read, wrong as the recipe's photograph.
   */
  coverIsCard?: boolean
  /** A video file the function can download, or null when the platform does not expose one. */
  videoUrl: string | null
  /** Headers the video URL only answers with (TikTok signs it to the page's cookies). */
  videoHeaders?: Record<string, string>
  /** How long the video runs, where the page says (TikTok, YouTube, X). */
  durationSeconds: number | null
}

/** The biggest video inlined for the model. Base64 makes it a third bigger again. */
export const MAX_VIDEO_BYTES = 18 * 1024 * 1024
/**
 * Imports are for short-form video: a reel, a TikTok, a Short. A model's bill
 * grows with every second it watches, and three minutes is a YouTube Short's
 * own ceiling; a twenty-minute cooking show is turned away rather than paid for.
 */
export const MAX_VIDEO_SECONDS = 180
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
): Promise<{ text: string; cookies: string; url: string } | null> {
  const res = await fetcher(url, {
    headers: { 'accept-language': 'en', accept: 'text/html,application/json', ...headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  })
  if (!res.ok) {
    await res.body?.cancel()
    return null
  }
  let bytes = await readBoundedBytes(res.body, MAX_PAGE_BYTES)
  // Deno's fetch decodes gzip and br but hands a deflate body over as it
  // came, and the Rednote reader has to offer deflate (`BROWSER_ENCODING`).
  if (/\bdeflate\b/i.test(res.headers.get('content-encoding') ?? '')) bytes = await inflate(bytes)
  // `getSetCookie` is the only way to read more than one Set-Cookie header.
  const cookies = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ')
  // Where the redirects ended. A stub response (a test's) has no url of its own.
  return { text: new TextDecoder().decode(bytes), cookies, url: res.url || url }
}

/**
 * A deflate body decoded, bounded like any page. HTTP's "deflate" is meant to
 * be zlib-wrapped and is sometimes sent raw, so both are tried; bytes that are
 * neither (a runtime that already decoded them) are kept as they are.
 */
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const stream = new Blob([new Uint8Array(bytes)])
        .stream()
        .pipeThrough(new DecompressionStream(format))
      return await readBoundedBytes(stream, MAX_PAGE_BYTES)
    } catch {
      // Not this format, or too big once decoded: try the next.
    }
  }
  return bytes
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
  const caption = post.caption ?? ''
  let linked: string | null = null
  if (recipeLinks(caption).length > 0) {
    let timer: ReturnType<typeof setTimeout> | undefined
    linked = await Promise.race([
      readLinkedRecipe(caption, fetcher).catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), LINKED_RECIPE_MS)
      }),
    ]).finally(() => {
      if (timer !== undefined) clearTimeout(timer)
    })
  }
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
    durationSeconds: null,
  }
}

/** A length in seconds, or null for anything that is not a positive number. */
function seconds(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * How long an MP4 runs, from its movie header (`moov` > `mvhd`). The one
 * length every downloaded file carries, Facebook's included, whose page says
 * nothing. Walks the boxes rather than searching for the name, which a video's
 * own bytes could contain. Exported for its test.
 */
export function mp4Seconds(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const type = (at: number) => String.fromCharCode(...bytes.subarray(at + 4, at + 8))
  // The box at `at`: where its contents start and where it ends.
  const box = (at: number, end: number) => {
    if (at + 8 > end) return null
    let size = view.getUint32(at)
    let header = 8
    if (size === 1) {
      if (at + 16 > end) return null
      size = Number(view.getBigUint64(at + 8))
      header = 16
    } else if (size === 0) {
      size = end - at
    }
    if (size < header || at + size > end) return null
    return { body: at + header, end: at + size }
  }
  const find = (name: string, from: number, end: number) => {
    for (let at = from; ; ) {
      const b = box(at, end)
      if (!b) return null
      if (type(at) === name) return b
      at = b.end
    }
  }
  const moov = find('moov', 0, bytes.byteLength)
  const mvhd = moov && find('mvhd', moov.body, moov.end)
  if (!mvhd) return null
  const v1 = bytes[mvhd.body] === 1
  const need = v1 ? 32 : 20
  if (mvhd.body + need > mvhd.end) return null
  const scale = view.getUint32(mvhd.body + (v1 ? 20 : 12))
  const length = v1 ? Number(view.getBigUint64(mvhd.body + 24)) : view.getUint32(mvhd.body + 16)
  return scale > 0 ? seconds(length / scale) : null
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
  if (link.platform === 'instagram') {
    // The preview's picture is 640 px on its long side (a reel's is 361 wide)
    // and, for a reel, has a play button burned into its pixels, which the
    // recipe page then showed enlarged over the dish. This address redirects
    // to the same frame at 640 wide with no button. The preview's own URL is
    // signed, so it cannot be edited into this one.
    post.coverUrl = `https://www.instagram.com/p/${link.id}/media/?size=l`
    post.coverFallbackUrl = httpsOrNull(tags['og:image'])
  } else {
    post.coverUrl = httpsOrNull(tags['og:image'])
    // Threads answers a link preview with a picture of the whole post (its
    // text, its logo, and the video or photos small inside it), for a photo
    // post as much as a video. Worth showing the model; not a photograph of
    // the dish.
    post.coverIsCard = true
  }
  post.videoUrl = httpsOrNull(tags['og:video']) ?? httpsOrNull(tags['og:video:secure_url'])
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
  // Twice at most. Now and then TikTok answers the same link with a page that
  // has no post in it (twice in about twenty reads on 2026-11-22, each time
  // fine when asked again), and without a second look that is "could not open
  // that post" for a video that is right there.
  let got: Awaited<ReturnType<typeof page>> = null
  let item: TikTokItem | null = null
  for (let attempt = 0; attempt < 2 && !item; attempt++) {
    got = await page(link.fetchUrl, { 'user-agent': BROWSER_UA }, fetcher).catch(() => null)
    item = got ? tiktokItem(got.text) : null
    if (!item) {
      console.warn(
        `[video-post] TikTok page ${got ? `without its post (${got.text.length} bytes)` : 'not read'}${
          attempt === 0 ? ', asking again' : ''
        }`,
      )
    }
  }
  if (!got || !item) return null

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
  post.durationSeconds = seconds(item.video?.duration)
  post.coverUrl =
    httpsOrNull(item.video?.cover) ??
    httpsOrNull(item.video?.originCover) ??
    httpsOrNull(item.imagePost?.cover?.imageURL?.urlList?.[0])

  // The file is signed to the page's own cookies, so it is fetched with them
  // and the page as the referrer, exactly as the page itself would.
  post.videoUrl =
    smallestTikTokVideo(item) ??
    httpsOrNull(item.video?.playAddr) ??
    httpsOrNull(item.video?.downloadAddr)
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

type HttpClientMaker = (options: { http2?: boolean }) => Deno.HttpClient
let http1Client: Deno.HttpClient | null | undefined

/**
 * The fetcher, over HTTP/1.1. YouTube's watch page fails over HTTP/2 in the
 * Supabase edge runtime (Deno 2.1: "http2 error: stream error detected", on
 * every try), while HTTP/1.1 reads the same page, and the page is where the
 * description and the length are. A test's own fetcher is left alone.
 */
function overHttp1(fetcher: Fetcher): Fetcher {
  if (fetcher !== globalThis.fetch) return fetcher
  const make = (Deno as unknown as { createHttpClient?: HttpClientMaker }).createHttpClient
  http1Client ??= make ? make({ http2: false }) : null
  const client = http1Client
  if (!client) return fetcher
  return ((input: string | URL | Request, init?: RequestInit) =>
    fetcher(input, { ...init, client } as RequestInit)) as Fetcher
}

async function readYouTube(link: VideoLink, fetcher: Fetcher): Promise<FetchedPost | null> {
  const post = base(link)
  // oEmbed for the title, channel and fallback cover; watch page for the
  // description, length and higher-res cover. Both are independent, so run them
  // together.
  const [oembed, watch] = await Promise.all([
    page(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link.canonicalUrl)}`,
      { 'user-agent': BROWSER_UA },
      fetcher,
    ).catch(() => null),
    page(link.canonicalUrl, { 'user-agent': BROWSER_UA }, overHttp1(fetcher)).catch((error) => {
      console.warn('[video-post] YouTube watch page not read:', String(error).slice(0, 160))
      return null
    }),
  ])
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
  if (watch) {
    post.durationSeconds = seconds(watch.text.match(/"lengthSeconds":"(\d+)"/)?.[1])
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
  // oEmbed's picture is `hqdefault`, 480 by 360: for a Short, a sliver of the
  // vertical video between blurred bars. The watch page names YouTube's own
  // choice instead, `maxresdefault` for an HD video and a portrait frame for a
  // Short; the portrait one it names is 405 wide, and `oardefault` is the same
  // frame at 720.
  const ogImage = watch ? httpsOrNull(metaTags(watch.text)['og:image']) : null
  const hq = `https://i.ytimg.com/vi/${link.id}/hqdefault.jpg`
  const fallback = post.coverUrl ?? hq
  if (ogImage && /^https:\/\/i\d*\.ytimg\.com\/vi(?:_webp)?\/[^/]+\/oar/.test(ogImage)) {
    post.coverUrl = `https://i.ytimg.com/vi/${link.id}/oardefault.jpg`
    post.coverFallbackUrl = ogImage
  } else {
    post.coverUrl = ogImage ?? fallback
    post.coverFallbackUrl = ogImage && ogImage !== fallback ? fallback : null
  }
  return post
}

// -- X ------------------------------------------------------------------------

/**
 * The token X's embed endpoint asks for, which its own embed script works out
 * from the post id. Any value is accepted today; this is the one it sends.
 */
function syndicationToken(id: string): string {
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
      video_info?: {
        duration_millis?: number
        variants?: Array<{ content_type?: string; url?: string; bitrate?: number }>
      }
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
  const millis = seconds(media?.video_info?.duration_millis)
  post.durationSeconds = millis === null ? null : millis / 1000
  // The smallest mp4 is plenty for reading a recipe, and the cheapest to send.
  const mp4 = (media?.video_info?.variants ?? [])
    .filter((v) => v.content_type === 'video/mp4' && v.url)
    .sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0))
  post.videoUrl = httpsOrNull(mp4[0]?.url)
  return post
}

// -- Facebook -----------------------------------------------------------------

/** A JSON string value out of a page, decoded. */
function jsonString(html: string, pattern: RegExp): string | null {
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

/**
 * What every browser sends. Rednote sends a client whose `accept-encoding`
 * lacks `deflate` to its login page, and Deno's own default is `gzip, br`:
 * without this every note read as "Log in - rednote", which the model then
 * judged not a recipe, and that verdict was cached for the video.
 */
const BROWSER_ENCODING = 'gzip, deflate, br'

async function readRednote(link: VideoLink, fetcher: Fetcher): Promise<FetchedPost | null> {
  const got = await page(
    link.fetchUrl,
    { 'user-agent': BROWSER_UA, 'accept-encoding': BROWSER_ENCODING },
    fetcher,
  )
  if (!got) return null
  // The login wall and the 404 page answer 200 at another path, with the note
  // only in a `redirectPath` query. Anything that is not the note is unread,
  // never a post for the model to judge.
  if (!new URL(got.url).pathname.toLowerCase().includes(link.id)) return null
  const post = base(link)
  // The note's own state, when the page is willing to hand it over.
  const note = rednoteNote(got.text, link.id)
  if (note) {
    post.title = typeof note.title === 'string' ? note.title.trim() || null : null
    // `#tofu[话题]#` is how a hashtag is stored; the caption reads `#tofu`.
    post.caption =
      typeof note.desc === 'string' ? note.desc.replace(/\[话题\]#/g, '').trim() || null : null
    post.author = typeof note.user?.nickname === 'string' ? note.user.nickname : null
    // The state names its CDN files over http; the same files answer https.
    post.coverUrl = httpsOrNull(upgrade(note.imageList?.[0]?.urlDefault))
    const stream = note.video?.media?.stream
    const variant = stream?.h264?.[0] ?? stream?.h265?.[0]
    post.videoUrl = httpsOrNull(upgrade(variant?.masterUrl))
    post.durationSeconds = seconds(note.video?.capa?.duration)
  }
  if (!post.caption && !post.title) {
    // A note's tags title it `<note> - rednote`. A page that is not a note
    // (taken down, a security check) is titled with the site's own name and
    // described with its slogan: unread, or its "not a recipe" is cached.
    const tags = metaTags(got.text)
    const title = tags['og:title']?.replace(/\s*-\s*(?:rednote|小红书)\s*$/i, '').trim()
    if (!title || /小红书|rednote|xiaohongshu/i.test(title)) return null
    post.title = title
    post.caption = tags['og:description'] ?? tags.description ?? null
    // The page names two `og:image`s, the site's logo (protocol-relative)
    // first, and `metaTags` keeps the first of a name: take the first that
    // is a picture this can fetch, regardless of attribute order.
    post.coverUrl =
      Array.from(got.text.matchAll(/<meta\s+[^>]*>/gi), (m) => {
        const tag = m[0]
        const key = tag.match(/(?:property|name)\s*=\s*"([^"]+)"/i)?.[1]?.toLowerCase()
        if (key !== 'og:image') return null
        const content = tag.match(/content\s*=\s*"([^"]+)"/i)?.[1]
        return content ? httpsOrNull(upgrade(decodeEntities(content))) : null
      }).find(Boolean) ?? null
  }
  return post
}

/**
 * The note in the page's `window.__INITIAL_STATE__`, which is a JavaScript
 * literal rather than JSON: it holds `undefined` and `new Set([])`, and either
 * one fails `JSON.parse` for the whole blob.
 */
function rednoteNote(html: string, id: string): RednoteNote | null {
  const state = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)?.[1]
  if (!state) return null
  try {
    const data = JSON.parse(jsLiteralToJson(state))
    return data?.note?.noteDetailMap?.[id.toLowerCase()]?.note ?? null
  } catch (error) {
    // A state blob that will not parse is the same as none, but it is said:
    // a new literal in Rednote's page would otherwise look like a quiet day.
    console.warn('[video-post] Rednote state did not parse:', String(error).slice(0, 200))
    return null
  }
}

/**
 * A JavaScript object literal as JSON, for the few things that are not JSON:
 * `undefined`, `NaN` and `Infinity` become `null`, and `new Set(x)` and
 * `new Map(x)` become `x` (an array). Strings are copied untouched, so a
 * caption that says "undefined" or "new Set(" keeps saying it.
 */
export function jsLiteralToJson(source: string): string {
  const token =
    /"(?:[^"\\]|\\.)*"|\bundefined\b|-?\bNaN\b|-?\bInfinity\b|\bnew\s+(?:Set|Map)\s*\(|[()]/g
  // One entry per open bracket: whether its closing one is dropped with it.
  const opened: boolean[] = []
  return source.replace(token, (match) => {
    if (match.startsWith('"')) return match
    if (match === '(') {
      opened.push(false)
      return match
    }
    if (match === ')') return opened.pop() ? '' : match
    if (match.startsWith('new')) {
      opened.push(true)
      return ''
    }
    return 'null'
  })
}

/** The parts of a note this reads. Every field is the page's, so none is trusted. */
type RednoteNote = {
  title?: unknown
  desc?: unknown
  user?: { nickname?: unknown }
  imageList?: Array<{ urlDefault?: unknown }>
  video?: {
    capa?: { duration?: unknown }
    media?: { stream?: Record<string, Array<{ masterUrl?: unknown }> | undefined> }
  }
}

function upgrade(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/^http:\/\//i, 'https://') : value
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

function hasSafePortAndAuth(url: URL): boolean {
  if (url.username || url.password) return false
  return !url.port || url.port === '80' || url.port === '443'
}

/** Candidate recipe links in a caption, in order. Exported for its test. */
export function recipeLinks(caption: string): URL[] {
  const out: URL[] = []
  for (const match of caption.matchAll(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi)) {
    try {
      const url = new URL(match[0].replace(/[).,!?;:]+$/, ''))
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
      if (!hasSafePortAndAuth(url)) continue
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
        let next: URL
        try {
          next = new URL(location, url)
        } catch {
          break
        }
        if (
          !isFetchableHost(next.hostname) ||
          !/^https?:$/.test(next.protocol) ||
          !hasSafePortAndAuth(next)
        ) {
          break
        }
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

function isPrivateIpv4Octets(p: number, q: number): boolean {
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

function parseIpv6Groups(raw: string): number[] | null {
  const address = raw.split('%')[0].toLowerCase()
  const halves = address.split('::')
  if (halves.length > 2) return null

  const parseSide = (side: string): number[] | null => {
    if (!side) return []
    const parts = side.split(':')
    const out: number[] = []
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (part.includes('.')) {
        if (i !== parts.length - 1) return null
        const octets = part.split('.').map(Number)
        if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
          return null
        }
        out.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3])
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(part)) return null
        out.push(Number.parseInt(part, 16))
      }
    }
    return out
  }

  const left = parseSide(halves[0])
  if (!left) return null
  if (halves.length === 1) return left.length === 8 ? left : null
  const right = parseSide(halves[1])
  if (!right) return null
  const fill = 8 - left.length - right.length
  if (fill < 1) return null
  return [...left, ...new Array<number>(fill).fill(0), ...right]
}

/** Whether an address is loopback, private, link-local, CGNAT or otherwise not the internet. */
export function isPrivateAddress(address: string): boolean {
  const a = address.trim().toLowerCase()
  if (a.includes(':')) {
    const g = parseIpv6Groups(a)
    // Fail closed on malformed addresses.
    if (!g) return true
    const zeros = (end: number) => g.slice(0, end).every((n) => n === 0)
    // Unspecified (::), loopback (::1), and deprecated IPv4-compatible (::/96).
    if (zeros(6)) return true
    // Unique local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8).
    if ((g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00) {
      return true
    }
    // Discard-only (100::/64) and documentation (2001:db8::/32).
    if (
      (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) ||
      (g[0] === 0x2001 && g[1] === 0x0db8)
    ) {
      return true
    }
    // IPv4-mapped (::ffff:0:0/96) and SIIT (::ffff:0:0:0/96): check embedded IPv4.
    const ipv4Mapped = zeros(5) && g[5] === 0xffff
    const siit = zeros(4) && g[4] === 0xffff && g[5] === 0
    // NAT64 well-known (64:ff9b::/96) and local-use (64:ff9b:1::/48).
    const nat64Local = g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 1
    if (nat64Local) return true
    const nat64WellKnown =
      g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0
    if (ipv4Mapped || siit || nat64WellKnown) {
      return isPrivateIpv4Octets(g[6] >> 8, g[6] & 0xff)
    }
    return false
  }
  const octets = a.split('.').map(Number)
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true
  }
  return isPrivateIpv4Octets(octets[0], octets[1])
}

/**
 * Whether every address a host name resolves to is on the public internet.
 * Refuses a name that does not resolve. Where the runtime offers no resolver
 * at all it answers yes, since the name itself has already passed
 * `isFetchableHost`; the edge runtime has one.
 */
async function resolvesPublicly(host: string): Promise<boolean> {
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
    return url.protocol === 'https:' && hasSafePortAndAuth(url) && isFetchableHost(url.hostname)
      ? url.toString()
      : null
  } catch {
    return null
  }
}

/**
 * A cover or a video, bounded, and only of the kind asked for: a platform that
 * answers an image URL with an HTML error page or SVG must not have that sent
 * to a model or stored as a cover. Redirect hops are validated manually (both
 * URL syntax and DNS resolution) within one shared timeout budget so a CDN
 * redirect cannot reach an internal host or multiply the timeout.
 */
export async function fetchMedia(
  url: string,
  maxBytes: number,
  typePrefix: 'image/' | 'video/',
  headers: Record<string, string> = { 'user-agent': BROWSER_UA },
  fetcher: Fetcher = fetch,
  timeoutMs: number = MEDIA_TIMEOUT_MS,
  resolves: (host: string) => Promise<boolean> = fetcher === fetch
    ? resolvesPublicly
    : () => Promise.resolve(true),
): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    let current = httpsOrNull(url)
    if (!current) return null
    const deadline = Date.now() + timeoutMs
    for (let hop = 0; hop < 4; hop++) {
      if (!(await resolves(new URL(current).hostname))) return null
      const remaining = deadline - Date.now()
      if (remaining <= 0) return null
      const res = await fetcher(current, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(remaining),
      })
      const location = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel()
        let next: string | null = null
        try {
          next = httpsOrNull(new URL(location, current).toString())
        } catch {
          return null
        }
        if (!next) return null
        current = next
        continue
      }
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      const length = Number(res.headers.get('content-length') ?? 0)
      const typeAllowed =
        typePrefix === 'image/'
          ? type.startsWith('image/') && !type.includes('svg')
          : type.startsWith('video/')
      if (!res.ok || !typeAllowed || length > maxBytes) {
        await res.body?.cancel()
        return null
      }
      return { bytes: await readBoundedBytes(res.body, maxBytes), type }
    }
    return null
  } catch (error) {
    console.warn(
      `[video-post] ${typePrefix} not fetched:`,
      error instanceof Error ? error.message : error,
    )
    return null
  }
}
