import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { Footer, Header } from "@/components/site-chrome";

const SHARE_SLUG = /^[a-f0-9]{32}$/;

export const metadata: Metadata = {
  description: "Open a food someone shared with you in RiceCal.",
  referrer: "no-referrer",
  robots: { follow: false, index: false },
  title: "Open a shared food",
};

export default async function SharedFoodPage({
  params,
}: PageProps<"/r/[slug]">) {
  const { slug } = await params;
  if (!SHARE_SLUG.test(slug)) notFound();

  const appUrl = `ricecal:///recipe/${encodeURIComponent(slug)}`;

  return (
    <>
      <Header />
      <main className="flex flex-1 items-center justify-center px-5 pt-28 pb-20">
        <div className="w-full max-w-xl text-center">
          <Image
            src="/mascot-192.png"
            alt=""
            width={192}
            height={192}
            className="bob mx-auto h-28 w-28"
            priority
          />
          <p className="mt-6 font-sans text-[12px] font-extrabold uppercase tracking-[0.12em] text-pandan-deep">
            Shared with you
          </p>
          <h1 className="mt-2 text-[36px] sm:text-[48px]">
            Someone saved you a plate
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[17px] text-muted">
            Open RiceCal to see the food, its ingredients and one serving.
          </p>

          <div className="mx-auto mt-8 flex max-w-sm flex-col gap-4">
            <a
              href={appUrl}
              className="squish bg-pandan text-on-fill [--squish-slab:var(--color-pandan-deep)] hover:brightness-[1.04]"
            >
              Open in RiceCal
            </a>
            {/* `/download` is a redirect-only route handler, so it needs a
                document navigation rather than an RSC prefetch. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/download"
              className="squish border border-line-strong bg-surface text-heading [--squish-slab:var(--color-line-strong)]"
            >
              Get RiceCal
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
