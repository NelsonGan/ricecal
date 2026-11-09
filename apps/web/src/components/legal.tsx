import Link from "next/link";

import { Footer, Header } from "@/components/site-chrome";
import { CONTACT_EMAIL, LEGAL_LAST_UPDATED } from "@/lib/site";

export type LegalBlock =
  | { kind: "p"; text: string }
  | { href: string; kind: "link"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "h3"; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "note"; text: string };

export type LegalSection = {
  blocks: LegalBlock[];
  id: string;
  title: string;
};

function Blocks({ blocks }: { blocks: LegalBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "p":
            return <p key={index}>{block.text}</p>;
          case "link":
            return (
              <p key={index}>
                <a
                  href={block.href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-pandan-deep underline underline-offset-4"
                >
                  {block.text}
                </a>
              </p>
            );
          case "h3":
            return (
              <h3 key={index} className="pt-2">
                {block.text}
              </h3>
            );
          case "ul":
            return (
              <ul key={index}>
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            );
          case "note":
            return (
              <p
                key={index}
                className="rounded-[20px] border border-line bg-surface p-4 text-[15px] text-body"
              >
                {block.text}
              </p>
            );
          case "table":
            return (
              <div key={index} className="overflow-x-auto">
                <table className="mt-1 w-full border-collapse text-[15px]">
                  <thead>
                    <tr className="border-b border-line-strong">
                      {block.headers.map((header) => (
                        <th
                          key={header}
                          className="py-2 pr-4 text-left font-sans font-extrabold text-ink"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row) => (
                      <tr key={row.join("|")} className="border-b border-line">
                        {row.map((cell) => (
                          <td key={cell} className="py-2.5 pr-4 align-top">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}

export function LegalPage({
  action,
  intro,
  sections,
  title,
}: {
  /** Optional call to action, shown between the intro and the contents. */
  action?: React.ReactNode;
  intro: string;
  sections: LegalSection[];
  title: string;
}) {
  return (
    <>
      <Header />

      <main className="flex-1 pt-28 pb-20 sm:pt-32">
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <Link
            href="/"
            className="font-sans text-[14px] font-extrabold text-muted transition-colors hover:text-pandan-deep"
          >
            ← Back to RiceCal
          </Link>

          <h1 className="mt-4 text-[34px] sm:text-[44px]">{title}</h1>
          <p className="mt-2 font-sans text-[14px] font-extrabold uppercase tracking-[0.08em] text-faint">
            Last updated {LEGAL_LAST_UPDATED}
          </p>
          <p className="mt-5 text-[17px] text-body">{intro}</p>

          {action ? <div className="mt-8">{action}</div> : null}

          <nav className="card card-sm mt-8 p-6">
            <h2 className="text-[17px]">On this page</h2>
            <ol className="mt-3 grid gap-2 sm:grid-cols-2">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-[15px] text-muted transition-colors hover:text-pandan-deep"
                  >
                    <span className="font-sans font-extrabold text-faint">
                      {String(index + 1).padStart(2, "0")}
                    </span>{" "}
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="prose-rice mt-12 space-y-10 text-[16px] text-body">
            {sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 space-y-3"
              >
                <h2>{section.title}</h2>
                <Blocks blocks={section.blocks} />
              </section>
            ))}
          </div>

          <div className="card card-sm mt-12 p-6">
            <h2 className="text-[20px]">Talk to a person</h2>
            <p className="mt-2 text-[16px] text-muted">
              Anything on this page, and anything not on it, goes to{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-bold text-pandan-deep underline underline-offset-4"
              >
                {CONTACT_EMAIL}
              </a>
              . There is also a{" "}
              <Link
                href="/contact"
                className="font-bold text-pandan-deep underline underline-offset-4"
              >
                contact page
              </Link>{" "}
              if you would rather fill something in.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
