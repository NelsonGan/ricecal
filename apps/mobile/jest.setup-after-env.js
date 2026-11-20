// @testing-library/react-native no longer extends `expect` on import — the
// matchers ship as a separate entrypoint you register yourself. Without this,
// `toBeDisabled` and friends fail with "is not a function", which reads like a
// typo rather than missing setup.
//
// Runs in setupFilesAfterEnv rather than setupFiles because `expect` does not
// exist until the test framework is installed.
expect.extend(require('@testing-library/react-native/matchers'))

// The MMKV mock's full-disk switch (jest.setup.js), off again before every
// test so one that forgets to turn it off cannot fail the rest. Optional: a
// suite may mock MMKV itself.
beforeEach(() => {
  require('react-native-mmkv').__failWrites?.(false)
})
