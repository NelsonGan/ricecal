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
    ['这道菜超好吃 http://xhslink.com/a/AbC123，复制本条信息打开小红书', 'rednote'],
  ])('names the platform of %s', (text, platform) => {
    expect(findVideoLink(text)?.platform).toBe(platform)
  })

  it('stops before Rednote fullwidth punctuation and Chinese text with no space', () => {
    expect(findVideoLink('做饭教程 http://xhslink.com/a/AbC123，复制本条信息')).toEqual({
      platform: 'rednote',
      url: 'http://xhslink.com/a/AbC123',
    })
  })

  it('rejects links with non-default ports or embedded credentials', () => {
    expect(findVideoLink('https://vm.tiktok.com:8443/ZSabc123/')).toBeNull()
    expect(findVideoLink('https://user:pass@www.instagram.com/reel/CnkNjXVsAJv/')).toBeNull()
  })

  it('reads a link with no scheme, as one typed or copied out of a caption', () => {
    expect(findVideoLink('instagram.com/reel/CnkNjXVsAJv/')).toEqual({
      platform: 'instagram',
      url: 'https://instagram.com/reel/CnkNjXVsAJv/',
    })
    expect(findVideoLink('fixupx.com/cook/status/1834623580987916752')?.platform).toBe('x')
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
