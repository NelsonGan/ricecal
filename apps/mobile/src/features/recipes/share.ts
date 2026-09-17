/** Where a shared recipe lives. One place, so a link cannot be built two ways. */
export const recipeLink = (shareSlug: string) =>
  `https://ricecal.app/r/${encodeURIComponent(shareSlug)}`
