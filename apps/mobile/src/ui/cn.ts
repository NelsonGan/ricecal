import clsx, { type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge only knows Tailwind's stock scales, so our custom keys
 * (`rounded-card`, `min-h-md`, `font-display`) would be treated as unrelated
 * to each other and both kept. Teaching it the extra keys is what makes
 * `<Button className="rounded-full" />` actually replace the internal
 * `rounded-md` rather than fight it.
 *
 * Class order in a string does not decide the winner in Tailwind — stylesheet
 * order does — so without this, a caller's override wins or loses at random.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-family': [{ font: ['display', 'display-bold', 'body', 'body-bold', 'body-black'] }],
      rounded: [{ rounded: ['sm', 'md', 'tile', 'sheet', 'card', 'full'] }],
      'min-h': [{ 'min-h': ['sm', 'md', 'lg'] }],
      'min-w': [{ 'min-w': ['sm', 'md', 'lg'] }],
    },
  },
})

/** Compose class names, letting later conflicting utilities win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
