"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";

import {
  DEFAULT_REGION,
  isRegion,
  regionFromTimeZone,
  type RegionSlug,
} from "@/lib/regions";

const STORAGE_KEY = "ricecal:region";

/**
 * Which country's food the localised parts of the site show, answered in this
 * order:
 *
 * 1. The URL, on `/my` and the rest — see {@link RegionLock}. A page with a
 *    country in its path shows that country's food to everybody, crawler
 *    included, which is the point of it having its own URL.
 * 2. The store below, on `/`: `localStorage` and the browser's time zone, read
 *    through `useSyncExternalStore`. That also settles hydration, since React
 *    renders the server snapshot first and the real one immediately after, so
 *    the HTML served from `/` is always the pan-Asian default.
 */

let current: RegionSlug | null = null;
const listeners = new Set<() => void>();

/** Private mode and some enterprise policies make storage throw on access. */
function read(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function detect(): RegionSlug {
  const saved = read();

  // A choice made in the footer outranks the time zone, always. Someone who
  // sets it to Japan from Kuala Lumpur meant it.
  if (saved && isRegion(saved)) return saved;

  return regionFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function notify() {
  for (const listener of listeners) listener();
}

/*
 * Never called while rendering on the server: React uses `getServerSnapshot`
 * there, so the `window` reads below are only reached in a browser.
 */
function getSnapshot(): RegionSlug {
  current ??= detect();
  return current;
}

function getServerSnapshot(): RegionSlug {
  return DEFAULT_REGION;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Two tabs open on the same site should not disagree about it.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    current = detect();
    notify();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const LockedRegion = createContext<RegionSlug | null>(null);

/**
 * Pins everything inside it to one region, whatever the browser would guess.
 *
 * Wrapped around a localised home page, where the path settles the country.
 * Being context rather than a client-side swap is what lets `/my` prerender
 * with Malaysian food in its HTML.
 */
export function RegionLock({
  children,
  region,
}: {
  children: React.ReactNode;
  region: RegionSlug;
}) {
  return (
    <LockedRegion.Provider value={region}>{children}</LockedRegion.Provider>
  );
}

export function useRegion(): {
  /** True when the URL settled this, so the picker is navigation, not a swap. */
  locked: boolean;
  region: RegionSlug;
  setRegion: (slug: RegionSlug) => void;
} {
  const locked = useContext(LockedRegion);
  const stored = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setRegion = useCallback((slug: RegionSlug) => {
    current = slug;

    try {
      window.localStorage.setItem(STORAGE_KEY, slug);
    } catch {
      /* A choice that lasts the session is still better than none. */
    }

    notify();
  }, []);

  return { locked: locked !== null, region: locked ?? stored, setRegion };
}
