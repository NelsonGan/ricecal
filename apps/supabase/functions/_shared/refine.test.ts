import { createMeter } from './entitlement.ts'
import { interpretInstruction, shapeInterpretation } from './llm.ts'
import { findRefinePart, matchingRefineParts } from './refine.ts'

const eq = (got: unknown, want: unknown) => {
  if (got !== want) throw new Error(`expected ${want}, got ${got}`)
}
const adjustment = {
  action: 'adjust',
  name: 'Chicken with rice',
  kcal_delta: -70,
  part: 'Grilled chicken',
  replaces: 'Grilled pork chop',
  part_kcal: 280,
}

Deno.test('a malformed swap is retried rather than turned into a pork reduction', () => {
  const answer = shapeInterpretation({ ...adjustment, part: 'Grilled pork chop' })
  eq(answer.action, 'none')
  if (answer.action === 'none') eq(answer.code, 'unusable')
  eq(shapeInterpretation({ ...adjustment, part: null }).action, 'none')
})
Deno.test('equal-calorie replacements still change ingredient identity', () => {
  const answer = shapeInterpretation({ ...adjustment, kcal_delta: 0 })
  eq(answer.action, 'adjust')
  if (answer.action === 'adjust') eq(answer.replaces, 'Grilled pork chop')
})
Deno.test('ingredient matching accepts a unique partial name with punctuation', () => {
  const parts = ['Grilled pork chop (170 g)', 'Steamed rice', 'Mixed vegetables']
  eq(
    findRefinePart(parts, 'the pork chop', (p) => p),
    parts[0],
  )
  eq(
    findRefinePart(parts, 'grilled pork chop, 170 g', (p) => p),
    parts[0],
  )
})
Deno.test('ingredient matching rejects ambiguity, blank names and substring collisions', () => {
  const parts = ['', 'Chicken breast', 'Chicken thigh', 'Rice', 'Rice noodles', 'Eggplant']
  eq(
    findRefinePart(parts, 'chicken', (p) => p),
    undefined,
  )
  eq(
    findRefinePart(parts, 'egg', (p) => p),
    undefined,
  )
  eq(
    findRefinePart(parts, 'pork chop', (p) => p),
    undefined,
  )
  eq(
    findRefinePart(parts, null, (p) => p),
    undefined,
  )
  eq(
    findRefinePart(parts, 'rice', (p) => p),
    'Rice',
  )
  eq(
    findRefinePart(['Rice', 'Rice'], 'rice', (p) => p),
    undefined,
  )
})

Deno.test('fractional ingredient counts survive interpretation', () => {
  for (const fields of [
    { total: 0.5, count: null },
    { total: null, count: -0.5 },
  ]) {
    const answer = shapeInterpretation({
      ...adjustment,
      part: 'Steamed rice',
      replaces: null,
      kcal_delta: -130,
      ...fields,
    })
    eq(answer.action, 'adjust')
    if (answer.action === 'adjust') {
      eq(answer.total, fields.total)
      eq(answer.count, fields.count)
    }
  }
})

for (const [label, firstContent] of [
  ['swap', JSON.stringify({ ...adjustment, part: adjustment.replaces })],
  ['JSON', '{'],
]) {
  Deno.test(`the interpreter retries malformed ${label} before returning a correction`, async () => {
    const previousFetch = globalThis.fetch
    const previousKey = Deno.env.get('OPENROUTER_API_KEY')
    const previousMock = Deno.env.get('MOCK_AI')
    let calls = 0
    try {
      Deno.env.set('OPENROUTER_API_KEY', 'test-key')
      Deno.env.delete('MOCK_AI')
      globalThis.fetch = (() => {
        calls++
        return Promise.resolve(
          Response.json({
            choices: [
              {
                message: {
                  content: calls === 1 ? firstContent : JSON.stringify(adjustment),
                },
              },
            ],
          }),
        )
      }) as typeof fetch
      const answer = await interpretInstruction(
        {
          name: 'Pork chop with rice',
          kcal: 610,
          quantity: 1,
          servingLabel: '1 plate',
          ingredients: [{ name: 'Grilled pork chop', quantity: 1, kcal: 350 }],
        },
        'This is not pork chop, but chicken',
        undefined,
        createMeter(),
      )
      eq(calls, 2)
      eq(answer.action, 'adjust')
      if (answer.action === 'adjust') eq(answer.part, 'Grilled chicken')
    } finally {
      globalThis.fetch = previousFetch
      if (previousKey === undefined) Deno.env.delete('OPENROUTER_API_KEY')
      else Deno.env.set('OPENROUTER_API_KEY', previousKey)
      if (previousMock === undefined) Deno.env.delete('MOCK_AI')
      else Deno.env.set('MOCK_AI', previousMock)
    }
  })
}
Deno.test('ambiguous additions are distinguishable from new ingredients', () => {
  const parts = ['Chicken breast', 'Chicken thigh']
  eq(matchingRefineParts(parts, 'chicken', (p) => p).length, 2)
  eq(matchingRefineParts(parts, 'egg', (p) => p).length, 0)
})
