/**
 * The food and workout update push, in each member's own language. It reads
 * like a chat message from the group, "Ana: Nasi lemak (640 kcal)", because
 * that is what it opens, with how many more there are when it stands for
 * several. The names and the share's own line are data; only the count needs
 * words.
 */
const MORE: Record<string, (count: number) => string> = {
  en: (n) => `and ${n} more`,
  ms: (n) => `dan ${n} lagi`,
  'zh-Hans': (n) => `等 ${n} 条`,
  'zh-Hant': (n) => `等 ${n} 則`,
  id: (n) => `dan ${n} lainnya`,
  th: (n) => `และอีก ${n} รายการ`,
  vi: (n) => `và ${n} mục khác`,
  fil: (n) => `at ${n} pa`,
  ja: (n) => `ほか${n}件`,
  ko: (n) => `외 ${n}개`,
  hi: (n) => `और ${n} अन्य`,
  ta: (n) => `மேலும் ${n}`,
  bn: (n) => `আরও ${n}টি`,
}

export type UpdateTarget = {
  token: string
  language: string
  group_id: string
  group_name: string
  actor_name: string | null
  body: string
  more: number
}

export function updatePush(target: UpdateTarget) {
  const more = MORE[target.language] ?? MORE.en
  // A missing name gets a word rather than a blank, as a chat push does.
  const name = target.actor_name?.trim() || 'RiceCal'
  const line = `${name}: ${target.body}`
  return {
    to: target.token,
    title: target.group_name,
    body: target.more > 0 ? `${line} ${more(target.more)}` : line,
    sound: 'default',
    // The same payload as a chat message's push, so every app version opens
    // the group's chat on a tap.
    data: { kind: 'group', groupId: target.group_id, chat: true },
  }
}

export const UPDATE_LANGUAGES = Object.keys(MORE)
