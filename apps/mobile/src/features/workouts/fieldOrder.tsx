import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from 'react'

import { fieldsFor, type LiveExercise } from './model'

/**
 * The order the pad's Next key walks a workout's fields in: each exercise top
 * to bottom, each set in turn, and within a set the columns left to right, so
 * weight, then reps, then the next set's weight. How a set is written down on
 * paper, and what Strong's Next does.
 *
 * Fields register a way to focus themselves; the order comes from the document
 * rather than from what happens to be mounted, so a set added mid-edit slots
 * into place without anybody re-registering.
 */

type Order = {
  register: (key: string, focus: () => void) => () => void
  /** Focuses the field after `key`. False when there is none. */
  next: (key: string) => boolean
  /** Whether a field comes after `key`, which decides the key's label. */
  hasNext: (key: string) => boolean
  /** Focuses the first field of the set after `key`'s. False when there is none. */
  nextSet: (key: string) => boolean
}

const OrderContext = createContext<Order | null>(null)

export const fieldKey = (exerciseKey: string, setId: string, field: string) =>
  `${exerciseKey}|${setId}|${field}`

/** The exercise and set half of a field's key. */
const setOf = (key: string) => key.slice(0, key.lastIndexOf('|'))

export function FieldOrderProvider({
  exercises,
  children,
}: {
  exercises: readonly LiveExercise[]
  children: ReactNode
}) {
  const focusers = useRef(new Map<string, () => void>())
  const keys = useMemo(
    () =>
      exercises.flatMap((exercise) =>
        exercise.sets.flatMap((set) =>
          fieldsFor(exercise.tracking).map((field) => fieldKey(exercise.key, set.id, field)),
        ),
      ),
    [exercises],
  )
  // Read at press time, so the order is the document's latest.
  const order = useRef(keys)
  order.current = keys

  const value = useMemo<Order>(() => {
    /** Focuses the first registered field after `index`. */
    const focusAfter = (index: number): boolean => {
      const list = order.current
      if (index < 0) return false
      for (let at = index + 1; at < list.length; at++) {
        const focus = focusers.current.get(list[at])
        if (focus) {
          focus()
          return true
        }
      }
      return false
    }

    return {
      register: (key, focus) => {
        focusers.current.set(key, focus)
        return () => {
          if (focusers.current.get(key) === focus) focusers.current.delete(key)
        }
      },
      next: (key) => focusAfter(order.current.indexOf(key)),
      hasNext: (key) => {
        const list = order.current
        const index = list.indexOf(key)
        return index >= 0 && index < list.length - 1
      },
      nextSet: (key) => {
        const list = order.current
        const set = setOf(key)
        let index = list.indexOf(key)
        if (index < 0) return false
        while (index + 1 < list.length && setOf(list[index + 1]) === set) index += 1
        return focusAfter(index)
      },
    }
  }, [])

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>
}

/** Registers a field's focus under its key. Outside a provider, it does nothing. */
export function useFieldOrder(key: string | undefined, focus: () => void) {
  const order = useContext(OrderContext)
  const latest = useRef(focus)
  latest.current = focus
  useEffect(() => {
    if (!order || !key) return
    return order.register(key, () => latest.current())
  }, [order, key])
  return order
}
