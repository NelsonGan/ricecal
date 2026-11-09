import Image from "next/image";

import { SectionIntro } from "@/components/section";

const CARDS = [
  {
    body: "One bowl, half a plate, two pieces with curry, five sticks. The portions people actually order.",
    icon: "/icons/food/portion-plate.png",
    tint: "bg-pandan-soft",
    title: "Portions you recognise",
  },
  {
    body: "Point at the plate. Every item gets named, the portion read as a weight, and anything can be fixed after.",
    icon: "/icons/system/camera.png",
    tint: "bg-kaya-soft",
    title: "Photo logging",
  },
  {
    body: "Go over and RiceCal simply says so. It will nudge, never nag.",
    icon: "/icons/system/lightbulb.png",
    tint: "bg-hibiscus-soft",
    title: "A calmer tracker",
  },
];

export function Why() {
  return (
    <section
      id="features"
      className="mx-auto max-w-[1200px] scroll-mt-24 px-5 pt-16 sm:px-8"
    >
      <SectionIntro
        body="Other trackers ask you to weigh 180 g of cooked rice. RiceCal asks whether it was a bowl or a plate, and moves on."
        eyebrow="Why RiceCal"
        title="Made for how Asia eats"
      />

      <div className="mt-9 grid gap-5 md:grid-cols-3">
        {CARDS.map((card) => (
          <article key={card.title} className="card p-[26px]">
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-[20px] ${card.tint}`}
            >
              <Image
                src={card.icon}
                alt=""
                width={192}
                height={192}
                className="h-8 w-8"
              />
            </span>
            <h3 className="mt-5 text-[23px]">{card.title}</h3>
            <p className="mt-2 text-[15px] leading-[1.6] text-body">
              {card.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
