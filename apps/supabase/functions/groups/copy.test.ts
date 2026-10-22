import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { pushMessage } from './copy.ts'

const target = {
  token: 'ExponentPushToken[x]',
  language: 'ms',
  actor_name: 'Aisha',
  group_name: 'Makan Buddies',
  group_id: 'g1',
  day: '2026-10-21',
  meal: 'lunch' as const,
}

Deno.test('a nudge is written in the recipient language and names the meal', () => {
  const message = pushMessage('nudge', target)
  assertStringIncludes(message.title, 'Aisha')
  assertStringIncludes(message.body, 'makan tengah hari')
  assertEquals(message.data, { kind: 'group', groupId: 'g1', day: '2026-10-21', invite: false })
})

Deno.test('an unknown language falls back to English', () => {
  assertStringIncludes(
    pushMessage('invite', { ...target, language: 'xx' }).body,
    'Join Makan Buddies',
  )
})

Deno.test('a missing name still says who, and a missing meal is not guessed', () => {
  const message = pushMessage('nudge', { ...target, language: 'en', actor_name: null, meal: null })
  assertStringIncludes(message.title, 'RiceCal')
  assertEquals(message.body, 'Makan Buddies')
})
