import Image from "next/image";

/**
 * The handset the tour runs inside, and the app's own furniture drawn in HTML.
 *
 * Everything here is a piece of RiceCal's design system rebuilt for the web at
 * the size a 320pt screen would show it. The screens in `screens.tsx` are
 * assembled out of these and nothing else, so a change to the app's chrome is
 * one edit rather than five.
 *
 * Not screenshots: fifteen regions times five screens times two colour schemes
 * is 150 pictures to reshoot whenever a button moves. Drawn, the tour follows
 * the reader's theme, stays sharp on any display, and shows the food of
 * whichever country the page settled on — see `lib/region-preview.ts`.
 */

/** The screen inside the bezel. Every screen is laid out against these. */
export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 640;

/**
 * What the phone's own status bar takes off the top.
 *
 * Screens clear it with padding rather than starting below it, so a sheet can
 * still darken the whole screen the way it does in the app.
 */
export const SCREEN_TOP = "pt-[40px]";

/**
 * A card's slab in light mode, its hairline in dark. Read from the same custom
 * properties `.card` uses, so the phone cannot drift from the page around it.
 */
const CARD_STYLE = {
  border: "var(--card-border)",
  boxShadow: "var(--card-slab)",
} as const;

export const MICRO =
  "font-sans text-[10px] font-extrabold uppercase tracking-[0.1em] text-faint";

/** A tinted square with an illustration in it: the app's tile, at phone size. */
export function Glyph({
  className = "h-[26px] w-[26px]",
  dim,
  src,
}: {
  className?: string;
  dim?: boolean;
  src: string;
}) {
  return (
    <Image
      alt=""
      className={`${className} ${dim ? "opacity-40 grayscale" : ""}`}
      height={192}
      src={src}
      width={192}
    />
  );
}

export function AppCard({
  children,
  className = "p-3.5",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-[22px] bg-surface ${className}`}
      style={{ ...CARD_STYLE, ...style }}
    >
      {children}
    </div>
  );
}

/**
 * One entry in the diary: picture tile, dish, portion, calories. The tile is
 * smaller than the app's, because this screen is 320 wide rather than 390 and
 * a row at its absolute size would stop being the same row.
 */
export function AppRow({
  className = "",
  detail,
  icon,
  style,
  title,
  unit = "kcal",
  value,
}: {
  className?: string;
  detail: string;
  icon: string;
  style?: React.CSSProperties;
  title: string;
  unit?: string;
  value: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`} style={style}>
      <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[17px] bg-surface-sunk">
        <Glyph className="h-[38px] w-[38px]" src={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-sans text-[14px] font-extrabold leading-[1.25] text-ink">
          {title}
        </span>
        <span className="block truncate font-sans text-[12px] leading-[1.35] text-muted">
          {detail}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-display text-[16px] font-extrabold leading-none text-ink">
          {value}
        </span>
        <span className="mt-0.5 block font-sans text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-faint">
          {unit}
        </span>
      </span>
    </div>
  );
}

/** The heading strip every tab screen opens with. */
export function ScreenHead({
  leading,
  title,
  trailing,
}: {
  leading?: React.ReactNode;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {leading}
      <h3 className="min-w-0 flex-1 truncate font-display text-[23px] leading-none text-heading">
        {title}
      </h3>
      {trailing}
    </div>
  );
}

/** A raised square control, pressed flat when it is the one being used. */
export function Squish({
  children,
  className = "",
  depth = 4,
  slab = "var(--line)",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  depth?: number;
  slab?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        ...style,
        boxShadow: depth ? `0 ${depth}px 0 ${slab}` : undefined,
      }}
    >
      {children}
    </div>
  );
}

const NAV = [
  { icon: "/icons/ui/home.png", label: "Today" },
  { icon: "/icons/food/cooking-pot.png", label: "Food" },
  { icon: "/icons/body/running-shoe.png", label: "Activity" },
  { icon: "/icons/ui/trends.png", label: "Trends" },
  { icon: "/icons/ui/profile.png", label: "Me" },
];

/** The bar at the foot of every tab screen. An inactive tab is grey. */
export function NavBar({ active }: { active: string }) {
  return (
    <div className="shrink-0 px-3 pb-3 pt-1.5">
      <div
        className="flex items-center justify-between rounded-[22px] bg-surface px-2 py-2"
        style={CARD_STYLE}
      >
        {NAV.map((tab) => {
          const on = tab.label === active;

          return (
            <span
              key={tab.label}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <Glyph className="h-[22px] w-[22px]" dim={!on} src={tab.icon} />
              <span
                className={`font-sans text-[9px] font-extrabold ${
                  on ? "text-pandan-deep" : "text-faint"
                }`}
              >
                {tab.label}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** The log button, floating over the day. */
export function Fab() {
  return (
    <span className="absolute bottom-[86px] right-4 flex h-[52px] w-[52px] items-center justify-center rounded-[19px] bg-pandan shadow-[0_5px_0_var(--color-pandan-deep)]">
      <Glyph className="h-[20px] w-[20px]" src="/icons/ui/plus.png" />
    </span>
  );
}

/** The status bar. Not the app's, the phone's — which is why it is up here. */
function StatusBar() {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex h-[40px] items-center justify-between px-6 pt-2">
      <span className="font-sans text-[12px] font-extrabold text-ink">
        9:41
      </span>
      <span className="flex items-center gap-1.5">
        <span className="flex items-end gap-[2px]">
          {[4, 6, 8, 10].map((height) => (
            <span
              key={height}
              className="w-[2.5px] rounded-[1px] bg-ink"
              style={{ height }}
            />
          ))}
        </span>
        <span className="flex h-[10px] w-[19px] items-center rounded-[3px] border-[1.5px] border-ink px-[1.5px]">
          <span className="h-[4px] w-[11px] rounded-[1px] bg-ink" />
        </span>
      </span>
    </div>
  );
}

/**
 * The bezel. Fixed at 320x640 and scaled down bodily below 360px rather than
 * reflowed — the screens inside are laid out in points the way the app lays
 * them out, and a phone that reflowed would stop being a picture of the app.
 */
export function PhoneFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    /*
     * Two boxes, because a transform does not change a layout box: scaled
     * alone, the phone still ASKED for 342px on a 320px screen and gave the
     * whole page a horizontal scrollbar. The outer one states the size the
     * scaled phone actually occupies.
     */
    <div className={`max-[359px]:h-[530px] max-[359px]:w-[274px] ${className}`}>
      <div
        className="relative origin-top-left max-[359px]:scale-[0.8]"
        style={{ height: SCREEN_HEIGHT + 22, width: SCREEN_WIDTH + 22 }}
      >
        {/* The rim is what keeps the phone visible in dark mode, where the
            bezel and the canvas behind it are four hex digits apart and the
            drop shadow under it lands on a surface already that dark. */}
        <div className="h-full w-full rounded-[52px] border border-white/10 bg-[#0d1211] p-[11px] shadow-[0_30px_60px_-28px_rgba(12,19,16,0.55)]">
          <div
            className="relative overflow-hidden rounded-[42px] bg-canvas"
            style={{ height: SCREEN_HEIGHT, width: SCREEN_WIDTH }}
          >
            <StatusBar />
            {children}
          </div>
        </div>

        {/* The island, over the screen rather than cut out of it. */}
        <span className="pointer-events-none absolute left-1/2 top-[20px] h-[24px] w-[84px] -translate-x-1/2 rounded-pill bg-[#0d1211]" />
      </div>
    </div>
  );
}
