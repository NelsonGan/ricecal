import { activity } from './activity'
import { common } from './common'
import { logging } from './logging'
import { onboarding } from './onboarding'
import { paywall } from './paywall'
import { profile } from './profile'
import { progress } from './progress'
import { recipes } from './recipes'

/**
 * The English bundle, and the shape every other locale must satisfy.
 *
 * One namespace per feature, matching the route group it serves. Deleting a
 * feature deletes its file; nothing dangles.
 *
 * Food names are NOT here. "nasi lemak" is data, not copy, and stays in its
 * local spelling in every language, so it lives with the mock food records.
 */
export const en = {
  common,
  activity,
  onboarding,
  logging,
  progress,
  profile,
  paywall,
  recipes,
} as const

export type Resources = typeof en
