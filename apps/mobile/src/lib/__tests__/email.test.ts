import { emailProblem, normaliseEmail, suggestEmail } from '../email'

/**
 * These cases are a bounce list, not a spec exercise.
 *
 * Each one is an address that reaches Supabase looking plausible and comes back
 * undeliverable — and a hard bounce here is not a wasted email, it is an account
 * created against a mailbox that will never receive the link that opens it.
 */

describe('normalising what was typed', () => {
  it('trims the space a double-tapped space bar leaves', () => {
    expect(normaliseEmail('  aisyah@gmail.com ')).toBe('aisyah@gmail.com')
  })

  /** Two accounts for one mailbox otherwise: Supabase looks users up lowercased. */
  it('lowercases', () => {
    expect(normaliseEmail('Aisyah@Gmail.COM')).toBe('aisyah@gmail.com')
  })

  it('unwraps what the contact picker hands over', () => {
    expect(normaliseEmail('Aisyah Rahman <aisyah@gmail.com>')).toBe('aisyah@gmail.com')
  })

  it('drops a mailto: prefix', () => {
    expect(normaliseEmail('mailto:aisyah@gmail.com')).toBe('aisyah@gmail.com')
  })

  /**
   * The worst of the lot: the address is correct on screen and bounces anyway,
   * and no amount of squinting at it finds the character that did it.
   */
  it('strips a zero-width character carried out of a web page', () => {
    expect(normaliseEmail('aisyah​@gmail.com﻿')).toBe('aisyah@gmail.com')
  })
})

describe('what cannot be delivered', () => {
  it.each([
    'aisyah@gmail.com',
    'aisyah.rahman@siswa.um.edu.my',
    'aisyah+diet@gmail.com',
    "o'brien@yahoo.com.my",
    'a@bc.my',
  ])('accepts %s', (email) => {
    expect(emailProblem(email)).toBeUndefined()
  })

  it.each([
    ['no domain at all', 'aisyah@'],
    ['no local part', '@gmail.com'],
    ['no at sign', 'aisyah.gmail.com'],
    ['a space in the middle', 'aisyah rahman@gmail.com'],
    ['no dot in the domain', 'aisyah@gmail'],
    ['a one-letter tld', 'aisyah@gmail.c'],
    ['a trailing dot', 'aisyah@gmail.com.'],
    ['two dots in a row', 'aisyah..rahman@gmail.com'],
    ['a leading dot', '.aisyah@gmail.com'],
    ['a hyphen at the edge of a label', 'aisyah@-gmail.com'],
    // Legal in the grammar, undeliverable from a phone — and the reason the
    // last label has to be letters rather than alphanumerics.
    ['a bare ip address', 'aisyah@192.168.1.1'],
  ])('refuses %s', (_why, email) => {
    expect(emailProblem(email)).toBe('format')
  })

  /**
   * Reserved so they never resolve. These are what gets typed to get past a
   * form, and what a developer testing against the hosted project reaches for.
   */
  it.each([
    'dev@example.com',
    'a@test.com',
    'a@ricecal.test',
    'a@localhost.local',
    'a@foo.invalid',
  ])('refuses the reserved domain in %s', (email) => {
    expect(emailProblem(email)).toBe('undeliverable')
  })
})

describe('the address they probably meant', () => {
  it.each([
    ['aisyah@gmail.con', 'aisyah@gmail.com'],
    ['aisyah@gmail.co', 'aisyah@gmail.com'],
    ['aisyah@gamil.com', 'aisyah@gmail.com'],
    // A transposition, which plain Levenshtein scores as two edits and misses.
    ['aisyah@gmial.com', 'aisyah@gmail.com'],
    ['aisyah@yaho.com', 'aisyah@yahoo.com'],
    ['aisyah@hotmial.com', 'aisyah@hotmail.com'],
    ['aisyah@outlok.com', 'aisyah@outlook.com'],
    ['aisyah@iclould.com', 'aisyah@icloud.com'],
  ])('offers %s as %s', (typo, meant) => {
    expect(suggestEmail(typo)).toBe(meant)
  })

  it('offers nothing for an address that is already right', () => {
    expect(suggestEmail('aisyah@gmail.com')).toBeUndefined()
  })

  /**
   * The expensive false positive. `ymail.com` is a real Yahoo domain one letter
   * from `gmail.com`, and "correcting" it sends the link to a stranger — which
   * is why every near neighbour of a common domain is itself on the known list.
   */
  it.each(['aisyah@ymail.com', 'aisyah@hotmail.co.uk', 'aisyah@rocketmail.com'])(
    'leaves the real domain %s alone',
    (email) => {
      expect(suggestEmail(email)).toBeUndefined()
    },
  )

  /** A company or a university address is not a misspelt Gmail. */
  it.each(['aisyah@siswa.um.edu.my', 'aisyah@ricecal.app', 'aisyah@petronas.com.my'])(
    'offers nothing for %s',
    (email) => {
      expect(suggestEmail(email)).toBeUndefined()
    },
  )

  it('says nothing about an address that is already refused', () => {
    expect(suggestEmail('aisyah@gmail')).toBeUndefined()
  })

  /** It corrects the domain and only the domain — a name is not misspelt. */
  it('leaves the local part as typed', () => {
    expect(suggestEmail('a.i.s.y.a.h+diet@gmail.con')).toBe('a.i.s.y.a.h+diet@gmail.com')
  })
})
