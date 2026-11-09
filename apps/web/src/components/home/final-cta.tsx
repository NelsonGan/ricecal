import Image from "next/image";

import { StoreButtons } from "@/components/store-buttons";

export function FinalCta() {
  return (
    <section
      id="get"
      className="mx-auto max-w-[1200px] scroll-mt-24 px-5 pt-16 pb-16 sm:px-8"
    >
      {/* `px-4` rather than `px-6` on a phone: this card sits inside the
          section's own padding, and at 320px the two paddings together left the
          store badges 112px each, which is narrower than "Google Play". */}
      <div className="card flex flex-col items-center px-4 py-14 text-center sm:px-10">
        {/* Full size, no tinted tile behind it — see `site-chrome.tsx`. */}
        <Image
          src="/icon-128.png"
          alt=""
          width={128}
          height={128}
          className="h-16 w-16 rounded-[22.5%]"
        />

        <h2 className="mt-5 text-[30px] sm:text-[40px]">
          Start with RiceCal Pro
        </h2>

        <StoreButtons className="mt-7" placement="final-cta" />
      </div>
    </section>
  );
}
