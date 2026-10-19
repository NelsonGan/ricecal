import { cn } from '../cn'

describe('merging class names', () => {
  it("lets a card's own padding replace the named card padding", () => {
    expect(cn('gap-3', 'p-card', 'p-0')).toBe('gap-3 p-0')
    expect(cn('p-card', 'gap-2 p-3')).toBe('gap-2 p-3')
  })

  it('keeps a side padding beside the named one, as before', () => {
    expect(cn('p-card', 'px-4')).toBe('p-card px-4')
  })

  it('still resolves the other named keys', () => {
    expect(cn('rounded-md', 'rounded-card')).toBe('rounded-card')
    expect(cn('px-gutter', 'px-4')).toBe('px-4')
  })
})
