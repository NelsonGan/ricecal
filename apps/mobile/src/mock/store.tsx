import { startOfDay } from 'date-fns'
import { createContext, type ReactNode, useContext, useMemo, useReducer, useRef } from 'react'

import { computeTargets } from './derive'
import {
  dateKey,
  newEntryId,
  SEED_ACHIEVEMENTS,
  SEED_CONNECTIONS,
  SEED_PRIVACY,
  SEED_PROFILE,
  SEED_REMINDERS,
  SEED_RINGS,
  SEED_STREAK,
  SEED_SUBSCRIPTION,
  SEED_TARGETS,
  SEED_WEEKLY_BURN,
  seedDays,
  seedSessions,
  seedWeighIns,
} from './fixtures'
import type {
  Achievement,
  ActivitySession,
  Connections,
  DayLog,
  DayRings,
  Entry,
  Meal,
  Plan,
  Privacy,
  Profile,
  Reminders,
  Subscription,
  SubscriptionStatus,
  Targets,
  WeighIn,
} from './types'

/**
 * The whole app's state, in memory.
 *
 * Deliberately not Supabase, not react-query, not persisted: this is the
 * hardcoded stand in that lets every screen be built and clicked through before
 * any backend exists. Every mutation a screen can trigger is an action here, so
 * swapping this for real mutations later is a change in one file, not thirty.
 */

export type AppState = {
  /** yyyy-MM-dd of the day the diary and Today are showing. */
  selectedDate: string
  /** The real current date, fixed at store creation. */
  todayKey: string
  days: Record<string, DayLog>
  profile: Profile
  targets: Targets
  weighIns: WeighIn[]
  sessions: ActivitySession[]
  rings: DayRings
  weeklyBurn: number[]
  achievements: Achievement[]
  subscription: Subscription
  reminders: Reminders
  connections: Connections
  privacy: Privacy
  streak: { current: number; best: number }
  onboarded: boolean
  /** The last entry added, so Today can highlight it and the toast can undo it. */
  lastAdded?: { entryId: string; meal: Meal; kcal: number }
}

export type Action =
  | { type: 'selectDate'; date: string }
  | { type: 'addEntry'; entry: Omit<Entry, 'id'>; kcal: number }
  | { type: 'updateEntry'; id: string; patch: Partial<Omit<Entry, 'id'>> }
  | { type: 'removeEntry'; id: string }
  | { type: 'clearLastAdded' }
  | { type: 'setWater'; glasses: number }
  | { type: 'logWeight'; kg: number }
  | { type: 'updateProfile'; patch: Partial<Profile>; recomputeTargets?: boolean }
  | { type: 'updateTargets'; patch: Partial<Targets> }
  | { type: 'setReminders'; patch: Partial<Reminders> }
  | { type: 'setConnections'; patch: Partial<Connections> }
  | { type: 'setPrivacy'; patch: Partial<Privacy> }
  | { type: 'setSubscription'; status: SubscriptionStatus; plan?: Plan }
  | { type: 'completeOnboarding' }
  | { type: 'reset' }

function initialState(): AppState {
  const today = startOfDay(new Date())
  return {
    selectedDate: dateKey(today),
    todayKey: dateKey(today),
    days: seedDays(today),
    profile: SEED_PROFILE,
    targets: SEED_TARGETS,
    weighIns: seedWeighIns(today),
    sessions: seedSessions(today),
    rings: SEED_RINGS,
    weeklyBurn: SEED_WEEKLY_BURN,
    achievements: SEED_ACHIEVEMENTS,
    subscription: SEED_SUBSCRIPTION,
    reminders: SEED_REMINDERS,
    connections: SEED_CONNECTIONS,
    privacy: SEED_PRIVACY,
    streak: SEED_STREAK,
    onboarded: false,
  }
}

const emptyDay = (date: string): DayLog => ({ date, entries: [], waterGlasses: 0 })

/** The selected day, created empty if the user paged somewhere with no history. */
function dayOf(state: AppState, date: string): DayLog {
  return state.days[date] ?? emptyDay(date)
}

function withDay(state: AppState, date: string, next: DayLog): AppState {
  return { ...state, days: { ...state.days, [date]: next } }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'selectDate':
      return { ...state, selectedDate: action.date }

    case 'addEntry': {
      const date = state.selectedDate
      const day = dayOf(state, date)
      const entry: Entry = { ...action.entry, id: newEntryId() }
      return {
        ...withDay(state, date, { ...day, entries: [...day.entries, entry] }),
        lastAdded: { entryId: entry.id, meal: entry.meal, kcal: action.kcal },
      }
    }

    case 'updateEntry': {
      // The entry may live on any day, not just the selected one — a correction
      // made from the diary applies to the day being viewed there.
      const date = Object.keys(state.days).find((key) =>
        state.days[key].entries.some((entry) => entry.id === action.id),
      )
      if (!date) return state
      const day = state.days[date]
      return withDay(state, date, {
        ...day,
        entries: day.entries.map((entry) =>
          entry.id === action.id ? { ...entry, ...action.patch } : entry,
        ),
      })
    }

    case 'removeEntry': {
      const date = Object.keys(state.days).find((key) =>
        state.days[key].entries.some((entry) => entry.id === action.id),
      )
      if (!date) return state
      const day = state.days[date]
      return {
        ...withDay(state, date, {
          ...day,
          entries: day.entries.filter((entry) => entry.id !== action.id),
        }),
        lastAdded: state.lastAdded?.entryId === action.id ? undefined : state.lastAdded,
      }
    }

    case 'clearLastAdded':
      return { ...state, lastAdded: undefined }

    case 'setWater': {
      const date = state.selectedDate
      const day = dayOf(state, date)
      return withDay(state, date, { ...day, waterGlasses: Math.max(0, action.glasses) })
    }

    case 'logWeight': {
      const date = state.todayKey
      const rest = state.weighIns.filter((w) => w.date !== date)
      return {
        ...state,
        weighIns: [...rest, { date, kg: action.kg }].sort((a, b) => a.date.localeCompare(b.date)),
        profile: { ...state.profile, weightKg: action.kg },
      }
    }

    case 'updateProfile': {
      const profile = { ...state.profile, ...action.patch }
      return {
        ...state,
        profile,
        // Targets follow the profile unless the user has set them by hand, in
        // which case Goals passes recomputeTargets: false.
        targets:
          action.recomputeTargets === false
            ? state.targets
            : {
                ...computeTargets(profile),
                waterGlasses: state.targets.waterGlasses,
                steps: state.targets.steps,
              },
      }
    }

    case 'updateTargets':
      return { ...state, targets: { ...state.targets, ...action.patch } }

    case 'setReminders':
      return { ...state, reminders: { ...state.reminders, ...action.patch } }

    case 'setConnections':
      return { ...state, connections: { ...state.connections, ...action.patch } }

    case 'setPrivacy':
      return { ...state, privacy: { ...state.privacy, ...action.patch } }

    case 'setSubscription':
      return {
        ...state,
        subscription: {
          ...state.subscription,
          status: action.status,
          plan: action.plan ?? state.subscription.plan,
          trialDaysLeft: action.status === 'trial' ? 3 : state.subscription.trialDaysLeft,
        },
      }

    case 'completeOnboarding':
      return { ...state, onboarded: true }

    case 'reset':
      return initialState()

    default:
      return state
  }
}

type Store = { state: AppState; dispatch: (action: Action) => void }

const StoreContext = createContext<Store | null>(null)

export function AppStoreProvider({
  children,
  preloadedState,
}: {
  children: ReactNode
  /** Tests and the gallery hand in a fixed slice instead of the seed. */
  preloadedState?: Partial<AppState>
}) {
  // useRef so the seed is built once. Passing `initialState()` inline would
  // rebuild 38 days of fixtures on every render before React discarded them.
  const seed = useRef<AppState>(undefined)
  seed.current ??= { ...initialState(), ...preloadedState }

  const [state, dispatch] = useReducer(reducer, seed.current)
  const value = useMemo(() => ({ state, dispatch }), [state])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside <AppStoreProvider>')
  return store
}

/** Read one slice. Keeps a screen from re-rendering on unrelated state. */
export function useAppState<T>(select: (state: AppState) => T): T {
  return select(useStore().state)
}

export function useDispatch(): (action: Action) => void {
  return useStore().dispatch
}

/** The day currently on screen, never undefined. */
export function useSelectedDay(): DayLog {
  const { state } = useStore()
  return state.days[state.selectedDate] ?? emptyDay(state.selectedDate)
}

export function useDay(date: string): DayLog {
  const { state } = useStore()
  return state.days[date] ?? emptyDay(date)
}

/**
 * Calories burned by logged workouts on a date, which the day's budget gets
 * back.
 *
 * Sessions come from a watch and only exist for today in the fixtures, so any
 * other date credits nothing rather than pretending the same run happened
 * every day.
 */
export function useDayBurn(date: string): number {
  const { state } = useStore()
  if (date !== state.todayKey) return 0
  return state.sessions.reduce((total, session) => total + session.kcal, 0)
}
