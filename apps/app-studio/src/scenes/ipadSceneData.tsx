import { getDuoScenes, type DuoSceneConfig } from './duoSceneData';

/**
 * iPad scenes, landscape 2732 × 2048, around native captures of a 13-inch iPad
 * Pro on its side in `/assets/screenshots-ipad/<app-code>` (2752 × 2064), where
 * RiceCal shows its tab rail and two panes.
 *
 * The story, headlines, order and planting are the iPhone Duo gallery's, scene
 * for scene: both are a wide device under a headline. Only the captures and the
 * frame differ.
 */
export type IPadSceneConfig = DuoSceneConfig;

export function getIPadScenes(locale: string): IPadSceneConfig[] {
  return getDuoScenes(locale, 'screenshots-ipad');
}
