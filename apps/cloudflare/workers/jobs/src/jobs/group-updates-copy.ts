/**
 * The food and workout update push. It is a chat message's push from the
 * group, built by the groups function's own `messagePush` so the two cannot
 * drift: the app matches that payload to open the chat, stack it with the
 * chat's other pushes and clear it when the chat opens. When it stands for
 * several shares the line says how many more, which is the only part needing
 * words of its own.
 */
import { type MessageTarget, messagePush } from '../../../../../supabase/functions/groups/copy.ts'

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

export type UpdateTarget = MessageTarget & {
  user_id: string
  language: string
  more: number
}

export function updatePush(target: UpdateTarget) {
  // Own keys only: the language is free text an app writes, and '__proto__'
  // or 'toString' would otherwise find the object's prototype.
  const more = Object.hasOwn(MORE, target.language) ? MORE[target.language] : MORE.en
  return messagePush({
    ...target,
    body: target.more > 0 ? `${target.body} ${more(target.more)}` : target.body,
  })
}

export const UPDATE_LANGUAGES = Object.keys(MORE)
