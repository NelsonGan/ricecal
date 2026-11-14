import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import { AppState } from 'react-native'

import { getWorkoutPrefs } from './prefs'

/** A little past the ding's 1.7 s, so the player is freed once it has rung. */
const RING_MS = 2500

let modeSet: Promise<void> | null = null

/**
 * The ding when a workout is saved, unless it is off in workout settings.
 *
 * It follows the silent switch and mixes with whatever is playing, so a gym
 * playlist neither pauses nor ducks for it. Only with the app in front: a
 * workout finished on the watch with the phone in a pocket has the watch's own
 * notice. The sound is `assets/sounds/workout-done.m4a`, made by
 * `scripts/sounds/workout-done.py`.
 */
export function playFinishSound(): void {
  if (!getWorkoutPrefs().finishSound || AppState.currentState !== 'active') return
  modeSet ??= setAudioModeAsync({
    playsInSilentMode: false,
    interruptionMode: 'mixWithOthers',
  }).catch(() => {})
  void modeSet.then(() => {
    try {
      const player = createAudioPlayer(require('../../../assets/sounds/workout-done.m4a'))
      player.play()
      setTimeout(() => player.remove(), RING_MS)
    } catch (failure) {
      // A sound is a nicety; a save is never held up or failed by one.
      console.warn('[workouts] finish sound failed', failure)
    }
  })
}
