import {
  fireEvent,
  type RenderResult,
  render as rntlRender,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import AboutStep from '../about'

/**
 * What this suite is for: the body answers reach the database exactly once, and
 * they are the ones on screen.
 *
 * Both halves have bitten. The screen used to write on every interaction, which
 * on the target weight slider is one request per frame of a drag — `Slider`
 * reports continuously — with the value that lands last decided by whichever
 * response came back last. And it seeded its two text fields from `useState`,
 * which runs before the newest weigh-in has arrived: the field then showed the
 * 65 kg placeholder to someone who weighs 80, and Continue wrote 65 back over
 * their real reading.
 */

// `mock`-prefixed so the factory below may close over it: everything else is
// out of scope by the time jest hoists the call.
const mockPush = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}))

jest.mock('@/data', () => ({
  useProfile: jest.fn(),
  useUpdateProfile: jest.fn(),
  useLogWeight: jest.fn(),
  useCurrentWeight: jest.fn(),
}))

const data = jest.mocked(require('@/data') as typeof import('@/data'))

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

const render = (ui: ReactElement) => rntlRender(ui, { wrapper: Providers })
const user = userEvent.setup()

const updateProfile = { mutateAsync: jest.fn(), isPending: false }
const logWeight = { mutateAsync: jest.fn(), isPending: false }

/** Only the fields this screen reads; the row itself has forty columns. */
const stub = (weightKg?: number, profile: Record<string, unknown> = {}) => {
  data.useProfile.mockReturnValue({ data: profile } as ReturnType<typeof data.useProfile>)
  data.useCurrentWeight.mockReturnValue(weightKg)
}

beforeEach(() => {
  jest.clearAllMocks()
  updateProfile.mutateAsync.mockResolvedValue(undefined)
  logWeight.mutateAsync.mockResolvedValue(undefined)
  data.useUpdateProfile.mockReturnValue(
    updateProfile as unknown as ReturnType<typeof data.useUpdateProfile>,
  )
  data.useLogWeight.mockReturnValue(logWeight as unknown as ReturnType<typeof data.useLogWeight>)
  stub(undefined)
})

const continueOn = async () => {
  await user.press(screen.getByText('Continue'))
}

/**
 * Replaces a field's contents in one go, without leaving it.
 *
 * `user.clear()` ends in a blur, and blur is where this screen normalises an
 * emptied field back to the stored answer — so clear-then-type models a user who
 * tapped away mid-edit rather than one who retyped a number.
 *
 * Do not follow this with `rerender`. The pair leaves React's root unusable for
 * the rest of the file, and every later render comes back empty; `user.type` is
 * the one to reach for when a re-render has to follow.
 */
const retype = (view: RenderResult, label: string, value: string) => {
  fireEvent.changeText(view.getByLabelText(label), value)
}

describe('saving', () => {
  it('writes every answer on screen, including the ones never touched', async () => {
    await render(<AboutStep />)
    await continueOn()

    // The defaults are displayed, so they are answers: leaving `sex` or
    // `birth_date` null makes the database's budget trigger give up quietly.
    expect(updateProfile.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ heightCm: 164, sex: 'female', targetWeightKg: 65 }),
    )
    expect(logWeight.mutateAsync).toHaveBeenCalledWith({ kg: 65 })
  })

  it('writes once, not once per interaction', async () => {
    await render(<AboutStep />)

    await user.press(screen.getByLabelText('Increase'))
    await user.press(screen.getByLabelText('Increase'))
    expect(updateProfile.mutateAsync).not.toHaveBeenCalled()

    await continueOn()
    expect(updateProfile.mutateAsync).toHaveBeenCalledTimes(1)
    expect(logWeight.mutateAsync).toHaveBeenCalledTimes(1)
  })

  it('carries on to the next step once both writes land', async () => {
    await render(<AboutStep />)
    await continueOn()

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/activity'))
  })

  /**
   * The budget on step 07 is computed from these two writes, so walking on
   * after a failure ends at a screen with no number on it and no way to know
   * why.
   */
  it('stays put and says so when a write fails', async () => {
    logWeight.mutateAsync.mockRejectedValue(new Error('Network request failed'))
    await render(<AboutStep />)
    await continueOn()

    expect(await screen.findByText('Network request failed')).toBeOnTheScreen()
    expect(mockPush).not.toHaveBeenCalled()
  })
})

describe('stored answers', () => {
  it('shows the profile and the newest weigh-in rather than the placeholders', async () => {
    stub(80, { height_cm: 178, sex: 'male', target_weight_kg: 74 })
    await render(<AboutStep />)

    expect(screen.getByLabelText('HEIGHT')).toHaveDisplayValue('178')
    expect(screen.getByLabelText('WEIGHT')).toHaveDisplayValue('80')
  })

  /**
   * The regression this guards. `useCurrentWeight` is a second query and the
   * router only waits for the profile, so the first render of this screen
   * usually has no weigh-in yet — an initial `useState` value copied from it
   * freezes the placeholder in, and Continue writes it back.
   */
  it('picks up a weigh-in that arrives after the first render', async () => {
    const view = await render(<AboutStep />)
    expect(screen.getByLabelText('WEIGHT')).toHaveDisplayValue('65')

    stub(80)
    await view.rerender(<AboutStep />)

    expect(screen.getByLabelText('WEIGHT')).toHaveDisplayValue('80')
    await continueOn()
    expect(logWeight.mutateAsync).toHaveBeenCalledWith({ kg: 80 })
  })

  it('keeps what the user typed once they have typed it', async () => {
    const view = await render(<AboutStep />)

    // Appended to the 65 already there, so this is a genuine edit in progress.
    await user.type(screen.getByLabelText('WEIGHT'), '.5')
    // A late weigh-in must not now overwrite the answer being given.
    stub(80)
    await view.rerender(<AboutStep />)

    expect(screen.getByLabelText('WEIGHT')).toHaveDisplayValue('65.5')
    await continueOn()
    expect(logWeight.mutateAsync).toHaveBeenCalledWith({ kg: 65.5 })
  })

  /**
   * Straight from the keyboard, with no blur in between: a user who taps
   * Continue while still in the field never fires one, so the clamp cannot live
   * only there.
   */
  it('clamps a mistyped height rather than computing a negative budget', async () => {
    const view = await render(<AboutStep />)

    retype(view, 'HEIGHT', '9')
    await continueOn()

    expect(updateProfile.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ heightCm: 120 }),
    )
  })
})
