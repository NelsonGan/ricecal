import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import { AppState } from 'react-native'

import { playFinishSound } from '../finishSound'
import { getWorkoutPrefs, setWorkoutPrefs } from '../prefs'

// Past the mode promise and the timer that frees the player.
const flush = () => jest.runAllTimersAsync()

const original = Object.getOwnPropertyDescriptor(AppState, 'currentState')
const appIs = (state: string) =>
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true })

describe('the finish sound', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.mocked(createAudioPlayer).mockClear()
    appIs('active')
  })

  afterEach(() => {
    jest.useRealTimers()
    if (original) Object.defineProperty(AppState, 'currentState', original)
  })

  it('is on by default', () => {
    expect(getWorkoutPrefs().finishSound).toBe(true)
  })

  it('rings once, following the silent switch and mixing with music', async () => {
    setWorkoutPrefs({ finishSound: true })
    playFinishSound()
    await flush()
    expect(setAudioModeAsync).toHaveBeenCalledWith({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
    })
    expect(createAudioPlayer).toHaveBeenCalledTimes(1)
    const player = jest.mocked(createAudioPlayer).mock.results[0].value
    expect(player.play).toHaveBeenCalled()
    expect(player.remove).toHaveBeenCalled()
  })

  it('stays quiet when turned off in settings', async () => {
    setWorkoutPrefs({ finishSound: false })
    playFinishSound()
    await flush()
    expect(createAudioPlayer).not.toHaveBeenCalled()
  })

  it('stays quiet with the app in the background', async () => {
    setWorkoutPrefs({ finishSound: true })
    appIs('background')
    playFinishSound()
    await flush()
    expect(createAudioPlayer).not.toHaveBeenCalled()
  })
})
