import type { ImportSource } from './parse'

/**
 * The apps a history comes in from: the settings rows, which open the file
 * picker, and the import screen's title. Each is its own row with its own icon so it is found at a glance.
 * The icons are the apps' own, from Brandfetch, and committed rather than
 * fetched, as the onboarding ones are.
 */
export const IMPORT_APPS: readonly {
  id: ImportSource
  /** The row's label and the screen's title. */
  entry: 'workouts:import.fromStrong' | 'workouts:import.fromHevy'
  logo: number
}[] = [
  {
    id: 'strong',
    entry: 'workouts:import.fromStrong',
    logo: require('../../../../assets/brands/apps/strong.jpg'),
  },
  {
    id: 'hevy',
    entry: 'workouts:import.fromHevy',
    logo: require('../../../../assets/brands/apps/hevy.jpg'),
  },
]
