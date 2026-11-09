"use client";

import { EVENTS, type Placement, trackLeaving } from "@/lib/analytics";
import { type StoreTarget } from "@/lib/platform";
import { APP_STORE_URL, PLAY_STORE_URL, STORE_LIVE } from "@/lib/site";

/** Both marks shrink with the badge, so a phone gets two of them side by side. */
const MARK = "h-[21px] w-[21px] shrink-0 sm:h-[26px] sm:w-[26px]";

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className={MARK} fill="currentColor" aria-hidden>
      <path d="M16.36 12.72c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.42-.14-2.77.83-3.49.83-.72 0-1.83-.81-3.01-.79-1.55.02-2.98.9-3.78 2.28-1.61 2.8-.41 6.95 1.16 9.22.77 1.12 1.68 2.37 2.88 2.32 1.16-.05 1.6-.75 3-.75s1.79.75 3.01.72c1.24-.02 2.03-1.13 2.79-2.25.88-1.29 1.24-2.54 1.26-2.6-.03-.01-2.43-.93-2.46-3.72ZM14.1 5.9c.64-.78 1.07-1.85.95-2.93-.92.04-2.03.61-2.69 1.38-.59.68-1.11 1.78-.97 2.83 1.02.08 2.07-.52 2.71-1.28Z" />
    </svg>
  );
}

/*
 * Apple's guidelines require its mark to be monochrome, so it takes
 * `currentColor` and comes out white on the dark badge. Google's do not, and
 * its four colours are what make the badge recognisable at a glance — a grey
 * Play triangle reads as a broken image rather than as "coming soon".
 */
function PlayMark() {
  return (
    <svg viewBox="0 0 24 24" className={MARK} aria-hidden>
      <path
        d="M3.61 1.81a1.01 1.01 0 0 0-.29.71v18.96c0 .28.11.53.29.71L13.79 12 3.61 1.81Z"
        fill="#4285F4"
      />
      <path
        d="M3.61 1.81 13.79 12l3.72-3.72L4.88 1.72a1 1 0 0 0-1.27.09Z"
        fill="#34A853"
      />
      <path
        d="M17.51 15.72 13.79 12 3.61 22.19a1 1 0 0 0 1.27.09l12.63-6.56Z"
        fill="#EA4335"
      />
      <path
        d="m17.51 15.72-3.72-3.72 3.72-3.72 4.2 2.39c.79.45.79 1.58 0 2.03l-4.2 2.39Z"
        fill="#FBBC04"
      />
    </svg>
  );
}

/*
 * Both badges keep the same width and neither label wraps — two store badges
 * at slightly different sizes is the first thing that reads as unfinished.
 *
 * They sit side by side at every width, which on a 375px phone only works
 * because the badge shrinks to meet it: the padding, the gap, the mark and
 * both lines of type step down until `sm` and back up after it. `flex-1` with
 * `min-w-0` rather than a width, so the pair splits whatever it is given and
 * survives all three containers it sits in — the hero column, the dish-page
 * aside and the centred card in the final CTA.
 */
const SHELL =
  "flex h-[58px] min-w-0 flex-1 items-center gap-1.5 rounded-[18px] px-2.5 sm:h-16 sm:w-[222px] sm:flex-none sm:gap-3 sm:rounded-[20px] sm:px-6";

function StoreButton({
  href,
  icon,
  label,
  live,
  placement,
  store,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  /**
   * Whether this store's listing exists yet. Per badge, not per site: iOS
   * shipped first, and for a while one of these was a link and the other a
   * label. Both are links now.
   */
  live: boolean;
  placement: Placement;
  /*
   * Shared with `/download` rather than written out here, so a badge press and
   * a "Get the app" press that reached the same store are one row in the
   * funnel breakdown rather than two.
   */
  store: StoreTarget;
  sub: string;
}) {
  const record = () =>
    trackLeaving(EVENTS.download, {
      live,
      placement,
      target: store,
    });

  const body = (
    <>
      {icon}
      {/*
        TWO LINES AT EVERY WIDTH. The sub-label used to drop below `sm` and
        reappear as one caption under the pair, which read as a note about the
        App Store rather than about both badges — it sat under the left half,
        because that is where a left-aligned line under a two-up grid sits.

        It fits: half of a 375px screen less the page padding is about 161,
        less the mark, the gap and the padding leaves ~114, and "Coming soon"
        at 11px wants about 76. The sub-label steps down to 10px below `sm` to
        keep the same room for the live text, which is longer.

        `min-w-0` and `truncate` stay as the net, not the plan.
      */}
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="w-full truncate font-sans text-[10px] font-extrabold uppercase tracking-[0.06em] text-canvas/70 sm:text-[11px] sm:tracking-[0.08em]">
          {live ? sub : "Coming soon"}
        </span>
        {/*
          Three sizes for two pixels. "Google Play" wants 75px at 14px, and the
          narrowest place it appears — the final CTA's card, inside the section's
          own padding, on a 320px screen — offers 73. Rather than squeezing the
          badge's padding down to 8px to win them, the type steps down on the
          phones that are actually that narrow and back up at 360.
        */}
        <span className="w-full truncate font-display text-[13px] font-extrabold min-[360px]:text-[14px] sm:text-[17px]">
          {label}
        </span>
      </span>
    </>
  );

  /*
   * The real badge either way, with only the sub-label saying which state it
   * is in: people recognise a store badge before they read it, and dressing it
   * down would trade that for a signal the words already carry — the more so
   * if the pair is ever split again, since the two have to keep reading as a
   * pair.
   */
  if (!live) {
    /*
     * The tap is recorded even though the badge does nothing: pressing a
     * button that says "Coming soon" is the clearest demand signal a
     * pre-launch page produces, and `live: false` keeps it out of the install
     * numbers.
     *
     * A `<span>` with no `role`, deliberately. It stays out of the tab order
     * and a screen reader hears the text rather than a control that refuses to
     * do anything; the `onClick` changes what we learn, not what it is.
     */
    return (
      <span
        onClick={record}
        className={`${SHELL} cursor-default bg-ink text-canvas`}
      >
        {body}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={record}
      className={`${SHELL} bg-ink text-canvas transition active:translate-y-[3px]`}
    >
      {body}
    </a>
  );
}

export function StoreButtons({
  className = "",
  placement,
}: {
  className?: string;
  placement: Placement;
}) {
  return (
    /*
     * `w-full` is not redundant: two of the three places these appear are
     * centred cards, where `items-center` shrinks children to their content
     * and the pair would come out the width of a single badge.
     */
    <div className={`flex w-full flex-col gap-2 sm:w-auto ${className}`}>
      <div className="flex w-full gap-2 sm:w-auto sm:flex-wrap sm:gap-3">
        <StoreButton
          href={APP_STORE_URL}
          icon={<AppleMark />}
          label="App Store"
          live={STORE_LIVE.app_store}
          placement={placement}
          store="app_store"
          sub="Download on the"
        />
        <StoreButton
          href={PLAY_STORE_URL}
          icon={<PlayMark />}
          label="Google Play"
          live={STORE_LIVE.play_store}
          placement={placement}
          store="play_store"
          sub="Get it on"
        />
      </div>
    </div>
  );
}
