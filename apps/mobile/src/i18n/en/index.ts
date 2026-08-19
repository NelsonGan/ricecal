import { activity } from './activity'
import { auth } from './auth'
import { common } from './common'
import { logging } from './logging'
import { onboarding } from './onboarding'
import { paywall } from './paywall'
import { profile } from './profile'
import { progress } from './progress'
import { recipes } from './recipes'
import { reviews } from './reviews'
import { suggest } from './suggest'

/**
 * The English bundle, and the shape every other locale must satisfy.
 *
 * One namespace per feature, matching the route group it serves. Deleting a
 * feature deletes its file; nothing dangles.
 *
 * Food names are NOT here. "nasi lemak" is data, not copy, and stays in its
 * local spelling in every language, so it lives in the catalogue.
 */
export const en = {
  common,
  activity,
  auth,
  onboarding,
  logging,
  progress,
  profile,
  paywall,
  recipes,
  reviews,
  suggest,
} as const

export type Resources = typeof en
