import { assertEquals } from 'jsr:@std/assert@1'

import { type DayContext, PICK_COUNT, shapePicks, suggestUserMessage } from './suggest.ts'

/**
 * Shaping the model's answer, and the message it is shaped from.
 *
 * Nothing here reaches the database — a suggestion is read and thrown away — so
 * every failure in this file renders as something odd on screen rather than as
 * an error anybody sees in a log. That is the kind that ships, which is why the
 * shaping is tested at all.
 */

const pick = (over: Record<string, unknown> = {}) => ({
  name: 'Sup kambing',
  portion: 'one bowl',
  kcal: 420,
  protein_g: 42,
  carbs_g: 9,
  fat_g: 19,
  sodium: 'high',
  icon: 'sup-kambing',
  why: [{ kind: 'protein', text: 'You are short on protein.' }],
  ...over,
})

Deno.test('keeps a well formed pick whole', () => {
  const [shaped] = shapePicks({ picks: [pick()] })
  assertEquals(shaped.name, 'Sup kambing')
  assertEquals(shaped.kcal, 420)
  assertEquals(shaped.sodium, 'high')
  assertEquals(shaped.icon, { set: 'dishes', name: 'sup-kambing' })
  assertEquals(shaped.why.length, 1)
})

Deno.test('drops a pick with no reasons, which is the whole feature', () => {
  assertEquals(shapePicks({ picks: [pick({ why: [] })] }), [])
  assertEquals(shapePicks({ picks: [pick({ why: undefined })] }), [])
})

Deno.test('drops a pick with no name', () => {
  assertEquals(shapePicks({ picks: [pick({ name: '   ' })] }), [])
})

Deno.test('falls back rather than dropping, for everything else', () => {
  const [shaped] = shapePicks({
    picks: [pick({ portion: '', sodium: 'volcanic', why: [{ kind: 'vibes', text: 'Nice.' }] })],
  })
  assertEquals(shaped.portion, 'one serving')
  assertEquals(shaped.sodium, 'medium')
  assertEquals(shaped.why[0].kind, 'calories')
})

Deno.test('takes a breakfast sentence off a dinner, and keeps the dish', () => {
  const [shaped] = shapePicks(
    {
      picks: [
        pick({
          why: [
            { kind: 'protein', text: 'Rendang provides protein to start your day.' },
            { kind: 'taste', text: 'Grilled over charcoal, so it stays light.' },
          ],
        }),
      ],
    },
    'dinner',
  )
  assertEquals(shaped.why.length, 1)
  assertEquals(shaped.why[0].kind, 'taste')
})

Deno.test('follows the phrase when it mutates', () => {
  // Pinned on "start your day" it came back as "start your daily intake".
  const dropped = (text: string) =>
    shapePicks(
      {
        picks: [
          pick({
            why: [
              { kind: 'protein', text },
              { kind: 'taste', text: 'Charcoal grilled and light with it.' },
            ],
          }),
        ],
      },
      'dinner',
    )[0].why.length === 1

  assertEquals(dropped('Provides protein to start your daily intake.'), true)
  assertEquals(dropped("A good start to your day's eating."), true)
  assertEquals(dropped('Warming after a long day at work.'), false)
})

Deno.test('never empties a pick to enforce that', () => {
  // Losing a DISH to a badly worded sentence is a worse answer than the
  // sentence, so a pick whose only reason is wrong keeps it.
  const [shaped] = shapePicks(
    { picks: [pick({ why: [{ kind: 'protein', text: 'A good start to your day.' }] })] },
    'dinner',
  )
  assertEquals(shaped.why.length, 1)
})

Deno.test('leaves breakfast talk alone when it IS breakfast', () => {
  const why = [{ kind: 'carbs', text: 'Sets you up for the morning.' }]
  assertEquals(shapePicks({ picks: [pick({ why })] }, 'breakfast')[0].why.length, 1)
  // And when nothing said which sitting it is.
  assertEquals(shapePicks({ picks: [pick({ why })] })[0].why.length, 1)
})

Deno.test('puts a capital on a name the model sent in lower case', () => {
  // It answers in the register of the icon list: `nasi-lemak`, `teh-tarik`.
  assertEquals(shapePicks({ picks: [pick({ name: 'nasi-lemak' })] })[0].name, 'Nasi lemak')
  assertEquals(shapePicks({ picks: [pick({ name: 'teh tarik' })] })[0].name, 'Teh tarik')
  // And leaves alone anything that already has one.
  assertEquals(
    shapePicks({ picks: [pick({ name: 'roti telur with dhal' })] })[0].name,
    'Roti telur with dhal',
  )
  assertEquals(shapePicks({ picks: [pick({ name: 'Nasi Lemak' })] })[0].name, 'Nasi Lemak')
})

Deno.test('reads a drawing off the dish name when the model named none', () => {
  const [shaped] = shapePicks({ picks: [pick({ name: 'Nasi lemak', icon: null })] })
  assertEquals(shaped.icon, { set: 'dishes', name: 'nasi-lemak' })
})

Deno.test('clamps a figure rather than believing it', () => {
  const [shaped] = shapePicks({ picks: [pick({ kcal: 99999, protein_g: -4, fat_g: 'lots' })] })
  assertEquals(shaped.kcal, 2000)
  assertEquals(shaped.protein_g, 0)
  assertEquals(shaped.fat_g, 0)
})

Deno.test('answers nothing at all for an answer in the wrong shape', () => {
  assertEquals(shapePicks({}), [])
  assertEquals(shapePicks({ picks: 'five things' }), [])
  assertEquals(shapePicks(null), [])
})

Deno.test('takes no more than it asked for', () => {
  const many = Array.from({ length: 12 }, () => pick())
  assertEquals(shapePicks({ picks: many }).length, PICK_COUNT)
})

const day: DayContext = {
  meal: 'dinner',
  focus: 'protein',
  cuisine: 'malay',
  healthy: true,
  kcalLimit: 500,
  kcalLeft: 613,
  proteinLeftG: 39,
  carbsLeftG: 120,
  fatLeftG: 22,
  eaten: ['Nasi lemak', 'Teh tarik'],
}

Deno.test('tells the model what has already been eaten', () => {
  const message = suggestUserMessage(day)
  assertEquals(message.includes('Nasi lemak, Teh tarik'), true)
  assertEquals(message.includes('613 kcal left'), true)
  assertEquals(message.includes('39 g protein'), true)
})

Deno.test('says a day with nothing on it is a day with nothing on it', () => {
  // Rather than an empty list, which reads to a model as a field it may ignore.
  const message = suggestUserMessage({ ...day, eaten: [] })
  assertEquals(message.includes('not eaten anything yet'), true)
})

Deno.test('does not tell somebody over budget that they have room', () => {
  const message = suggestUserMessage({ ...day, kcalLeft: 0 })
  assertEquals(message.includes('already used'), true)
  assertEquals(message.includes('0 kcal left'), false)
})

Deno.test('leaves a macro out rather than sending it as a zero', () => {
  // A zero here reads to the model as a rule about the food: told "0 g carbs"
  // it answered a whole meal with boiled eggs and chicken breast.
  const message = suggestUserMessage({ ...day, carbsLeftG: 0, fatLeftG: 0 })
  assertEquals(message.includes('39 g protein'), true)
  assertEquals(message.includes('carbs'), false)
  assertEquals(message.includes('fat'), false)
})

Deno.test('says so when there is nothing left to make up', () => {
  const message = suggestUserMessage({ ...day, proteinLeftG: 0, carbsLeftG: 0, fatLeftG: 0 })
  assertEquals(message.includes('met every macro target'), true)
})
