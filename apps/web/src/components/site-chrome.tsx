import Image from "next/image";
import Link from "next/link";

import { DownloadLink } from "@/components/download-link";
import { RegionPicker } from "@/components/region-picker";
import { COUNTRIES, countryCode, label } from "@/lib/countries";
import { SITE_NAME } from "@/lib/site";

const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#reviews", label: "Reviews" },
  { href: "/#pricing", label: "Pricing" },
];

/** Apple wants these reachable from every page. */
const FOOTER_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/data-deletion", label: "Data deletion" },
  { href: "/contact", label: "Support" },
];

export function Wordmark({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      {/* A finished app icon with its own ground, edge to edge, so it is drawn
          at full size rather than shrunk inside a tinted tile — which would be
          invisible in light mode and a brown frame in dark. */}
      <Image
        src="/icon-128.png"
        alt=""
        width={128}
        height={128}
        className="h-10 w-10 rounded-[22.5%]"
        priority
      />
      <span className="flex flex-col">
        <span className="font-display text-[20px] font-extrabold leading-tight text-heading">
          {SITE_NAME}
        </span>
        {subtitle ? (
          <span className="hidden font-sans text-[10px] font-extrabold uppercase leading-tight tracking-[0.12em] text-faint sm:block">
            Asian calorie tracker
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/70 bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between gap-6 px-5 sm:px-8">
        <Wordmark />

        <div className="flex items-center gap-7">
          <nav className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-sans text-[15px] font-extrabold text-muted transition-colors hover:text-pandan-deep"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* The only call to action on every page. `DownloadLink` owns the
              redirect and the event, so the header and the pricing cards
              cannot disagree about what a download click is.

              `squish` is the design system's primary button — a solid slab the
              press drops the control onto. `squish-nav` shrinks the box below
              `sm`, where the wordmark has first claim on the header; both live
              in `globals.css`, because they are unlayered and no utility can
              override them. */}
          <DownloadLink
            placement="header"
            className="squish squish-nav shrink-0 whitespace-nowrap bg-pandan text-on-fill [--squish-slab:var(--color-pandan-deep)] hover:brightness-[1.04]"
          >
            Get the app
          </DownloadLink>
        </div>
      </div>
    </header>
  );
}

/**
 * The fifteen localised home pages, linked from every page on the site. The
 * region picker beside it does the same job for a reader and none of it for a
 * crawler, since a `<select>` calling `router.push` is not a link to follow.
 *
 * The heading carries the phrase so each link does not have to: "Calorie
 * tracker by country" above a row of country names says the same as fifteen
 * anchors reading "Malaysia calorie tracker", without reading like a footer
 * written for a machine. Those exact anchors are on the home page, in
 * `home/countries.tsx`.
 */
function CountryNav() {
  return (
    <nav aria-labelledby="footer-countries" className="border-b border-line/70">
      <div className="mx-auto max-w-[1200px] px-5 py-7 sm:px-8">
        <h2
          id="footer-countries"
          className="font-sans text-[12px] font-extrabold uppercase leading-tight tracking-[0.12em] text-faint"
        >
          Calorie tracker by country
        </h2>

        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {COUNTRIES.map((country) => (
            <li key={country.slug}>
              <Link
                href={`/${countryCode(country)}`}
                className="font-sans text-[14px] font-bold text-muted transition-colors hover:text-pandan-deep"
              >
                {label(country)}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <CountryNav />

      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-5 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2.5">
          <Image
            src="/icon-128.png"
            alt=""
            width={128}
            height={128}
            className="h-6 w-6 rounded-[22.5%]"
          />
          <span className="font-sans text-[14px] font-extrabold text-muted">
            {SITE_NAME}, made in Kuala Lumpur
          </span>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
          <RegionPicker />

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-sans text-[14px] font-bold text-muted transition-colors hover:text-pandan-deep"
              >
                {link.label}
              </Link>
            ))}
            <span className="font-sans text-[14px] font-bold text-faint">
              {new Date().getFullYear()}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
