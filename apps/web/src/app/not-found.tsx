import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Footer, Header } from "@/components/site-chrome";

/**
 * A 404 that says so in its title. Without one it inherits the root layout's
 * and introduces itself to Google as the home page — two URLs with one title
 * and one body, which is the shape of a soft 404.
 *
 * No `robots`: Next already writes `noindex` onto every 404 it renders. No
 * canonical either, since this body answers at whatever URL was asked for and
 * none of them is worth nominating.
 */
export const metadata: Metadata = {
  description: "The page you asked for is not here.",
  title: { absolute: "Page not found · RiceCal" },
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="flex flex-1 items-center justify-center px-5 pt-28 pb-20">
        <div className="text-center">
          <Image
            src="/mascot-192.png"
            alt=""
            width={192}
            height={192}
            className="bob mx-auto h-24 w-24"
          />
          <h1 className="mt-5 text-[34px] sm:text-[44px]">
            Nothing on this plate
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[17px] text-muted">
            The page you asked for is not here.
          </p>
          <Link
            href="/"
            className="squish mt-7 bg-pandan text-on-fill [--squish-slab:var(--color-pandan-deep)]"
          >
            Back to RiceCal
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
