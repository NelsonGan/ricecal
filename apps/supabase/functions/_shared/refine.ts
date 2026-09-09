/** A partial name must identify one ingredient, never whichever row comes first. */
export function matchingRefineParts<T>(
  parts: T[],
  wanted: string | null,
  nameOf: (part: T) => string,
): T[] {
  const normalize = (name: string) =>
    name
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/^(?:the|a|an) /, '')
  const needle = normalize(wanted ?? '')
  if (!needle) return []
  const named = parts.map((part) => ({ part, name: normalize(nameOf(part)) }))
  const exact = named.filter((row) => row.name === needle)
  if (exact.length) return exact.map((row) => row.part)
  const matches = named.filter(
    ({ name }) =>
      name && (` ${name} `.includes(` ${needle} `) || ` ${needle} `.includes(` ${name} `)),
  )
  return matches.map((row) => row.part)
}

export function findRefinePart<T>(
  parts: T[],
  wanted: string | null,
  nameOf: (part: T) => string,
): T | undefined {
  const matches = matchingRefineParts(parts, wanted, nameOf)
  return matches.length === 1 ? matches[0] : undefined
}
