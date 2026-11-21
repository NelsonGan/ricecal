import { toVideoCredit } from '@/data/mappers'
import { findVideoLink } from '../videoLink'

describe('findVideoLink', () => {
  it('finds the link inside what a share sheet hands over', () => {
    expect(
      findVideoLink('Look at this! https://www.instagram.com/reel/CnkNjXVsAJv/?igsh=abc.'),
    ).toEqual({
      platform: 'instagram',
      url: 'https://www.instagram.com/reel/CnkNjXVsAJv/?igsh=abc',
    })
  })

  it.each([
    ['https://vm.tiktok.com/ZSabc123/', 'tiktok'],
    ['https://youtu.be/zJi7h-nKngw', 'youtube'],
    ['https://m.youtube.com/shorts/3s9njjK_SdY', 'youtube'],
    ['https://twitter.com/cook/status/1834623580987916752', 'x'],
    ['https://www.threads.net/@cook/post/DQ1-TOCjY3l', 'threads'],
    ['https://fb.watch/abcDEF/', 'facebook'],
    ['http://xhslink.com/a/AbC123 复制本条信息', 'rednote'],
  ])('names the platform of %s', (text, platform) => {
    expect(findVideoLink(text)?.platform).toBe(platform)
  })

  it('refuses text that is not a supported link', () => {
    expect(findVideoLink('nasi lemak')).toBeNull()
    expect(findVideoLink('https://instagram.com.evil.example/reel/X')).toBeNull()
    expect(findVideoLink('https://www.example.com/reel/X')).toBeNull()
    expect(findVideoLink(undefined)).toBeNull()
  })
})

describe('toVideoCredit', () => {
  it('keeps a credit the server wrote', () => {
    expect(toVideoCredit('tiktok', '@cook', 'https://www.tiktok.com/@cook/video/1')).toEqual({
      platform: 'tiktok',
      author: '@cook',
      url: 'https://www.tiktok.com/@cook/video/1',
    })
  })

  it('drops a platform this build does not know, and a link that is not https', () => {
    expect(toVideoCredit('myspace', '@cook', 'https://myspace.com/x')).toBeUndefined()
    expect(toVideoCredit('tiktok', '@cook', 'http://www.tiktok.com/x')).toBeUndefined()
    expect(toVideoCredit(null, null, null)).toBeUndefined()
  })
})
