import { createDeleteGate } from '../deleteGate'

it('returns false to a second delete while the first still owns the decision', async () => {
  const gate = createDeleteGate()
  let decide!: (deleted: boolean) => void
  const first = gate(
    async () =>
      await new Promise<boolean>((resolve) => {
        decide = resolve
      }),
  )
  const secondWork = jest.fn(async () => true)

  await expect(gate(secondWork)).resolves.toBe(false)
  expect(secondWork).not.toHaveBeenCalled()

  decide(false)
  await expect(first).resolves.toBe(false)
  await expect(gate(secondWork)).resolves.toBe(true)
})
