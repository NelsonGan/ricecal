import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Footer, Header } from "@/components/site-chrome";
import { pageMetadata } from "@/lib/seo";
import { CONTACT_EMAIL, DISCORD_URL } from "@/lib/site";

import { ContactForm } from "./contact-form";

export const metadata: Metadata = pageMetadata({
  description:
    "Get in touch with RiceCal. Email support@ricecal.app or join the Discord. A person reads every message.",
  path: "/contact",
  title: "Contact",
});

const CHANNELS = [
  {
    body: "Support, bugs, billing, deletion requests. We answer within two working days.",
    cta: CONTACT_EMAIL,
    href: `mailto:${CONTACT_EMAIL}`,
    icon: "/icons/mail.png",
    title: "Email us",
  },
  {
    body: "Portion arguments, feature requests, and the people building it.",
    cta: "Join the server",
    href: DISCORD_URL,
    icon: "/icons/chat.png",
    title: "Discord",
  },
];

export default function Contact() {
  return (
    <>
      <Header />

      <main className="relative flex-1 overflow-hidden pt-28 pb-20 sm:pt-32">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_20%_0%,var(--pandan-soft),transparent_70%),radial-gradient(50%_50%_at_90%_10%,var(--water-soft),transparent_70%)]"
        />

        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <div className="text-center">
            <Image
              src="/mascot-192.png"
              alt=""
              width={192}
              height={192}
              className="bob mx-auto h-20 w-20"
            />
            <h1 className="mt-4 text-[34px] sm:text-[44px]">Talk to us</h1>
            <p className="mx-auto mt-4 max-w-xl text-[17px] text-muted sm:text-[19px]">
              A person reads every message. Tell us what broke, what is missing,
              or what would make the app better.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {CHANNELS.map((channel) => (
              <article key={channel.title} className="card card-sm p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-pandan-soft">
                  <Image
                    src={channel.icon}
                    alt=""
                    width={192}
                    height={192}
                    className="h-7 w-7"
                  />
                </div>
                <h2 className="mt-4 text-[20px]">{channel.title}</h2>
                <p className="mt-2 text-[15px] text-muted">{channel.body}</p>
                <a
                  href={channel.href}
                  rel="noopener noreferrer"
                  target={channel.href.startsWith("http") ? "_blank" : undefined}
                  className="mt-4 inline-block font-sans text-[15px] font-extrabold text-pandan-deep underline underline-offset-4"
                >
                  {channel.cta}
                </a>
              </article>
            ))}
          </div>

          <div className="mt-8">
            <ContactForm />
          </div>

          <div className="card card-sm mt-8 p-6">
            <h2 className="text-[20px]">Before you write</h2>
            <ul className="mt-3 space-y-2.5 text-[15px] text-body">
              <li>
                Deleting your account takes two taps{" "}
                <Link
                  href="/data-deletion"
                  className="font-bold text-pandan-deep underline underline-offset-4"
                >
                  inside the app
                </Link>
                ; the page says what to cancel first.
              </li>
              <li>
                Refunds go through Apple and Google, not us. The{" "}
                <Link
                  href="/terms"
                  className="font-bold text-pandan-deep underline underline-offset-4"
                >
                  Terms of Use
                </Link>{" "}
                explain why, and we will still help you make the case.
              </li>
              <li>
                Something wrong with a meal? The dish name and roughly when you
                logged it is enough for us to find it.
              </li>
            </ul>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
