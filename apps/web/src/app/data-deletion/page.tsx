import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, type LegalSection } from "@/components/legal";
import { pageMetadata } from "@/lib/seo";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  description:
    "How to delete your RiceCal account and every piece of data attached to it. Two taps inside the app, what goes, what stays, and how to cancel your subscription first.",
  path: "/data-deletion",
  title: "Data Deletion",
});

const DELETION_SUBJECT = "Delete my RiceCal account";
const DELETION_BODY = [
  "Please delete my RiceCal account and all data attached to it.",
  "",
  "Account email:",
  "Platform (iPhone / Android):",
  "Why I cannot delete it in the app:",
  "",
  "I understand this is permanent and that my diary cannot be recovered afterwards.",
].join("\n");

const DELETION_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  DELETION_SUBJECT,
)}&body=${encodeURIComponent(DELETION_BODY)}`;

const SECTIONS: LegalSection[] = [
  {
    blocks: [
      {
        kind: "p",
        text: `Deleting your account is something you do yourself, in ${SITE_NAME}, and it happens immediately. There is nobody to write to and nothing to wait for.`,
      },
      {
        kind: "ul",
        items: [
          "Open RiceCal and go to the Me tab.",
          "Scroll to Settings and tap Account.",
          "Tap Delete my account, then confirm.",
        ],
      },
      {
        kind: "p",
        text: "That erases your account and everything listed below from our live systems there and then, and signs you out. You do not have to give a reason. If you want to tell us what went wrong, we would like to hear it, but it changes nothing about the deletion.",
      },
      {
        kind: "note",
        text: "Deletion is permanent. Your diary, your photos and your history cannot be recovered afterwards, by you or by us. If you only want a break, signing out or deleting the app leaves everything where it is.",
      },
    ],
    id: "in-the-app",
    title: "Delete it in the app",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "Deleting your account does not cancel a subscription, because the subscription lives with Apple or Google rather than with us. Cancel it first, or you will keep being billed for an account that no longer exists.",
      },
      { kind: "h3", text: "On iPhone or iPad" },
      {
        kind: "ul",
        items: [
          "Open Settings, tap your name, then Subscriptions.",
          "Tap RiceCal, then Cancel Subscription.",
        ],
      },
      { kind: "h3", text: "On Android" },
      {
        kind: "ul",
        items: [
          "Open the Google Play Store, tap your profile picture, then Payments and subscriptions, then Subscriptions.",
          "Tap RiceCal, then Cancel subscription.",
        ],
      },
      {
        kind: "p",
        text: "A lifetime purchase has nothing to cancel. Deleting your account ends your access to it, and it cannot be transferred to a new account afterwards.",
      },
    ],
    id: "cancel-first",
    title: "Cancel your subscription first",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "Everything below is erased from our live systems the moment you confirm, and from encrypted backups within a further 30 days as they roll off.",
      },
      {
        kind: "table",
        headers: ["What", "Where it lives"],
        rows: [
          ["Your account and sign-in identity", "Our authentication system"],
          [
            "Your profile: height, weight, age, sex, target, activity level, preferences",
            "Our database",
          ],
          [
            "Your daily goals, meal times, reminders and settings",
            "Our database",
          ],
          [
            "Every logged meal, its items, portions and macros",
            "Our database",
          ],
          [
            "Every meal photo you uploaded, and every scan the model produced",
            "Private object storage",
          ],
          [
            "The foods you wrote, including any you published to the community",
            "Our database",
          ],
          ["Your weigh-ins, water and day notes", "Our database"],
          [
            "Activity synced from Apple Health or Health Connect",
            "Our database",
          ],
          [
            "Your subscription mirror and your AI request counters",
            "Our database",
          ],
          [
            "The analytics profile your email address was attached to",
            "Our analytics provider",
          ],
        ],
      },
    ],
    id: "what-goes",
    title: "What gets deleted",
  },
  {
    blocks: [
      {
        kind: "ul",
        items: [
          "Copies of a food you published that other users saved to their own diaries. Those copies became theirs when they saved them, and your name is not attached to them.",
          "The anonymous record of searches and barcodes the app could not match. Those entries are search terms and product codes with no account attached to them.",
          "Product analytics events, error reports and session recordings made before deletion. The account email is removed from the linked analytics profile, but the pseudonymous history is kept for up to 14 months. Events and error reports contain no diary content; a session recording can show what was on screen while it was recorded.",
          "Records we are legally required to keep, such as transaction records for tax. These hold no diary content.",
          "Anything Apple or Google holds about your purchase. That is theirs and is subject to their own policies.",
        ],
      },
    ],
    id: "what-stays",
    title: "What does not get deleted",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "You do not have to delete everything to get rid of something. Inside the app you can:",
      },
      {
        kind: "ul",
        items: [
          "delete a single entry, or the photo attached to it, from the entry itself;",
          "delete a food you wrote, or make a published one private again;",
          "disconnect Apple Health or Health Connect in Settings, which stops all further reading and removes the activity we synced from it;",
          "turn off notifications and reminders in Settings without touching anything else.",
        ],
      },
      {
        kind: "p",
        text: "You can also ask us for a copy of your data instead of a deletion, and we will send it in a portable format. Write to us and say so.",
      },
    ],
    id: "partial",
    title: "If you want less than everything",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "The app is the fastest route and the only one that is instant. Write to us instead if you cannot reach it: you have lost the device, you cannot sign in, or the address on the account no longer exists.",
      },
      {
        kind: "ul",
        items: [
          "Write from the email address your account uses, so we can be sure the request is yours. If you signed in with Apple’s “Hide My Email”, write from the relay address Apple gave you, or tell us the relay address in the message.",
          "Tell us which platform you use, so we can check both stores for an active subscription.",
        ],
      },
      {
        kind: "p",
        text: "We acknowledge every request within 3 working days and complete it within 30 days. In practice it is usually the same week.",
      },
    ],
    id: "cannot-sign-in",
    title: "If you cannot get into the app",
  },
];

function DeletionAction() {
  return (
    <div className="card p-7">
      <h2 className="text-[22px]">Delete your account</h2>
      <p className="mt-2 text-[16px] text-muted">
        It is two taps inside {SITE_NAME}, and it is immediate: the Me tab, then
        Account, then Delete my account. Everything below goes with it.
      </p>
      <p className="mt-5 text-[15px] text-muted">
        Cancel your subscription first, in the{" "}
        <a
          href="#cancel-first"
          className="font-bold text-pandan-deep underline underline-offset-4"
        >
          App Store or Google Play
        </a>
        . Deleting the account does not stop the billing, and{" "}
        <Link
          href="/privacy"
          className="font-bold text-pandan-deep underline underline-offset-4"
        >
          the Privacy Policy
        </Link>{" "}
        explains what we held in the first place.
      </p>
      <p className="mt-5 text-[15px] text-muted">
        Locked out of the app? Write to{" "}
        <a
          href={DELETION_MAILTO}
          className="font-bold text-pandan-deep underline underline-offset-4"
        >
          {CONTACT_EMAIL}
        </a>{" "}
        and we will do it for you.
      </p>
    </div>
  );
}

export default function DataDeletion() {
  return (
    <LegalPage
      action={<DeletionAction />}
      intro="Your data is yours, including the right to take it back. This page says how to delete your RiceCal account and everything in it, what survives that, and how long it takes."
      sections={SECTIONS}
      title="Data Deletion"
    />
  );
}
