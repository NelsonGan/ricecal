import Image from "next/image";

/** The small grey line above every heading. Never a pill, never coloured. */
export function Eyebrow({
  children,
  onDark,
}: {
  children: React.ReactNode;
  onDark?: boolean;
}) {
  return (
    <p
      className={`font-sans text-[12px] font-extrabold uppercase tracking-[0.14em] ${
        onDark ? "text-muted" : "text-faint"
      }`}
    >
      {children}
    </p>
  );
}

/** A section opener: eyebrow, 42px heading, one paragraph. */
export function SectionIntro({
  body,
  center,
  eyebrow,
  onDark,
  title,
}: {
  body?: string;
  center?: boolean;
  eyebrow?: string;
  onDark?: boolean;
  title: string;
}) {
  return (
    <div className={`max-w-[640px] ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow ? <Eyebrow onDark={onDark}>{eyebrow}</Eyebrow> : null}
      <h2
        className={`mt-2 text-[32px] leading-[1.1] sm:text-[42px] ${
          onDark ? "text-[#F2F5F3]" : ""
        }`}
      >
        {title}
      </h2>
      {body ? (
        <p
          className={`mt-3 text-[17px] leading-[1.6] sm:text-[18px] ${
            onDark ? "text-[#B9C4BF]" : "text-body"
          }`}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

/** The ticked list under a feature heading. */
export function CheckList({
  items,
  onDark,
}: {
  items: string[];
  onDark?: boolean;
}) {
  return (
    <ul className="mt-6 flex flex-col gap-3.5">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-3">
          <span
            className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[12px] ${
              onDark ? "bg-[#14291F]" : "bg-pandan-soft"
            }`}
          >
            <Image
              src="/icons/ui/check.png"
              alt=""
              width={192}
              height={192}
              className="h-[18px] w-[18px]"
            />
          </span>
          <span
            className={`font-sans text-[15px] font-bold ${
              onDark ? "text-[#B9C4BF]" : "text-body"
            }`}
          >
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One of the alternating feature rows: copy on one side, a mock of the screen
 * it describes on the other. `flip` puts the mock first on desktop and leaves
 * the stack order alone on mobile, where copy always leads.
 */
export function FeatureRow({
  body,
  checks,
  eyebrow,
  flip,
  mock,
  onDark,
  title,
}: {
  body: string;
  checks?: string[];
  eyebrow: string;
  flip?: boolean;
  mock: React.ReactNode;
  onDark?: boolean;
  title: string;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
        <Eyebrow onDark={onDark}>{eyebrow}</Eyebrow>
        <h2
          className={`mt-2 text-[30px] leading-[1.12] sm:text-[38px] ${
            onDark ? "text-[#F2F5F3]" : ""
          }`}
        >
          {title}
        </h2>
        <p
          className={`mt-3 text-[17px] leading-[1.65] ${
            onDark ? "text-[#B9C4BF]" : "text-body"
          }`}
        >
          {body}
        </p>
        {checks ? <CheckList items={checks} onDark={onDark} /> : null}
      </div>

      <div className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>{mock}</div>
    </div>
  );
}
