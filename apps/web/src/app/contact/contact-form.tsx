"use client";

import { useMemo, useState } from "react";

import { EVENTS, trackLeaving } from "@/lib/analytics";
import { CONTACT_EMAIL } from "@/lib/site";

const TOPICS = [
  "Something is broken",
  "Trouble logging a meal",
  "A calorie figure looks wrong",
  "Billing or subscription",
  "Delete my account",
  "Something else",
] as const;

const FIELD =
  "w-full rounded-[20px] border border-line-strong bg-surface px-4 py-3 text-[16px] text-ink outline-none transition focus:border-pandan focus:ring-4 focus:ring-pandan-soft";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<string>(TOPICS[0]);
  const [message, setMessage] = useState("");

  const mailto = useMemo(() => {
    const subject = `RiceCal: ${topic}`;
    const body = [
      `Name: ${name || "not given"}`,
      `Reply to: ${email || "not given"}`,
      `Topic: ${topic}`,
      "",
      message,
    ].join("\n");

    return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  }, [email, message, name, topic]);

  const ready = message.trim().length > 0;

  return (
    <form
      className="card p-6 sm:p-8"
      onSubmit={(event) => {
        event.preventDefault();

        /*
         * The topic and nothing else — one of six fixed strings. The paragraph
         * under this button promises nothing typed here is submitted to a
         * server, and an analytics call is a server, so the name, address and
         * message stay in the `mailto:`.
         *
         * `trackLeaving` because a `mailto:` hands off without unloading the
         * page, so the batch flush on `pagehide` may never come.
         */
        trackLeaving(EVENTS.contactSubmitted, { topic });

        window.location.href = mailto;
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-sans text-[13px] font-extrabold uppercase tracking-[0.08em] text-faint">
            Your name
          </span>
          <input
            className={`${FIELD} mt-2`}
            name="name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Aisyah"
            type="text"
            value={name}
          />
        </label>

        <label className="block">
          <span className="font-sans text-[13px] font-extrabold uppercase tracking-[0.08em] text-faint">
            Email we should reply to
          </span>
          <input
            className={`${FIELD} mt-2`}
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            type="email"
            value={email}
          />
        </label>
      </div>

      <fieldset className="mt-6">
        <legend className="font-sans text-[13px] font-extrabold uppercase tracking-[0.08em] text-faint">
          What is it about
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {TOPICS.map((option) => {
            const active = option === topic;
            return (
              <button
                type="button"
                key={option}
                onClick={() => setTopic(option)}
                aria-pressed={active}
                className={`rounded-pill border px-4 py-2 font-sans text-[15px] font-bold transition ${
                  active
                    ? "border-pandan bg-pandan-soft text-pandan-deep"
                    : "border-line-strong bg-surface text-body hover:border-pandan"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-6 block">
        <span className="font-sans text-[13px] font-extrabold uppercase tracking-[0.08em] text-faint">
          Your message
        </span>
        <textarea
          className={`${FIELD} mt-2 min-h-[160px] resize-y`}
          name="message"
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Tell us what happened, and what you expected instead."
          value={message}
        />
      </label>

      <button
        type="submit"
        disabled={!ready}
        className="squish mt-6 w-full bg-pandan text-on-fill [--squish-slab:var(--color-pandan-deep)] disabled:opacity-50"
      >
        Open in your mail app
      </button>

      <p className="mt-3 text-center text-[14px] text-faint">
        This fills in an email for you to send. Nothing is submitted to a server
        from this page, so nothing you type here is stored by us.
      </p>
    </form>
  );
}
