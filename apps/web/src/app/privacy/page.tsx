import type { Metadata } from "next";

import { LegalPage, type LegalSection } from "@/components/legal";
import { pageMetadata } from "@/lib/seo";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  description:
    "How RiceCal collects, uses, stores and deletes your data: your food diary, plate photos, health and activity readings, purchases and diagnostics.",
  path: "/privacy",
  title: "Privacy Policy",
});

const SECTIONS: LegalSection[] = [
  {
    blocks: [
      {
        kind: "p",
        text: `${SITE_NAME} is a calorie and nutrition diary for iPhone and Android, operated by Nelson Gan (“RiceCal”, “we”, “us”, “our”). We are the data controller for the personal data described in this policy.`,
      },
      {
        kind: "p",
        text: `This policy covers the RiceCal mobile app, this website, and the servers behind them. It does not cover the App Store, Google Play, Apple Health, Health Connect, or anything else you use alongside RiceCal, each of which has its own privacy policy.`,
      },
      {
        kind: "p",
        text: `Questions about anything here go to ${CONTACT_EMAIL} and reach a person, not a queue.`,
      },
    ],
    id: "who-we-are",
    title: "Who we are",
  },
  {
    blocks: [
      {
        kind: "ul",
        items: [
          "We collect what the app needs to count your calories: your account, the body figures your daily budget is worked out from, and what you log.",
          "Plate photos are stored privately and are only readable through short-lived links issued to your own account.",
          "A photo or a written description of a meal is sent to an AI provider so it can be identified. Your name, email and account identifier are not sent with it.",
          "Health and activity readings are only read if you connect Apple Health or Health Connect, and only to show your activity and extend your daily calorie budget.",
          "We never use your diary, your photos or your health data for advertising. We do not sell your personal data, and we do not share it with data brokers.",
          "You can delete your account and everything in it from inside the app at any time, in Me then Account. See the Data Deletion page.",
        ],
      },
    ],
    id: "summary",
    title: "The short version",
  },
  {
    blocks: [
      { kind: "h3", text: "Account and identity" },
      {
        kind: "ul",
        items: [
          "Your email address, and the name your provider gives us when you sign in with Apple or Google. If you use Apple’s “Hide My Email”, we only ever see the relay address Apple gives us.",
          "An account identifier we generate, which is what everything else in your diary is keyed on.",
          "The dates your account was created, onboarded and last used.",
        ],
      },
      { kind: "h3", text: "Your profile and your goal" },
      {
        kind: "ul",
        items: [
          "Height, weight, target weight, sex and age. These are the inputs to your daily calorie budget and are used for nothing else.",
          "How active your day is, and the food style tags you pick during setup (for example halal, mamak, kopitiam, vegetarian), which are used to rank search results.",
          "Your daily calorie and macro goals, kept as a dated history so that changing your target tomorrow does not rewrite yesterday.",
          "Your display, unit, reminder and privacy settings, and the times you eat your meals.",
        ],
      },
      { kind: "h3", text: "Your diary" },
      {
        kind: "ul",
        items: [
          "Every meal you log: what it was, how much of it, when, and the calories and macros attached to it.",
          "Photographs of meals you choose to scan, and the ingredient breakdown produced from them.",
          "Foods you write, including their ingredients, steps and serving counts. One stays private unless you choose to publish it.",
          "Water, day notes, weigh-ins and the streak worked out from your logging.",
        ],
      },
      { kind: "h3", text: "Health and activity, only if you connect it" },
      {
        kind: "ul",
        items: [
          "From Apple Health (iOS) or Health Connect (Android): steps, distance, workouts and sessions, active and total calories burned, heart rate where a workout carries it, weight and body fat readings.",
          "Nothing is read until you grant permission on the device, and reading stops the moment you revoke it or disconnect in Settings.",
          "Readings are stored on our servers so that your budget, your charts and your weekly reviews can be worked out in one place rather than only on the handset that read them.",
        ],
      },
      { kind: "h3", text: "Purchases" },
      {
        kind: "ul",
        items: [
          "Your subscription or lifetime purchase status, which store it came from, and when it renews or expires. This mirror is written by RevenueCat from the store’s own reports.",
          "We never see or store your card, bank details or billing address. Payment is taken by Apple or Google, not by us.",
        ],
      },
      { kind: "h3", text: "Diagnostics and product analytics" },
      {
        kind: "ul",
        items: [
          "Crash and error reports, including the device model, operating system version, app version and the technical trace of what failed.",
          "Product analytics events, such as which features are used and which actions are completed, with a device identifier, app version, and coarse locale and timezone. When you are signed in, these events use your RiceCal account identifier. PostHog also receives your account email so support can find the same profile; Google Analytics does not receive your name or email.",
          "Recordings of a small sample of app and website sessions (session replay), showing the screens as they were used, so we can see where something is confusing or broken. Passwords are always hidden, and on this website so is anything typed into a form. In the app a recording can show what is on screen, such as your foods, the day's totals and the email you sign in with; it is linked to your RiceCal account identifier.",
          "For each AI request (identifying a meal from a photo or a description, reading a recipe, correcting an entry), a record of which model answered, how long it took, what it cost and whether it failed, linked to your account identifier. The photo, the text you wrote and the model's answer are not part of that record.",
          "On this website, we record the page type and path, campaign tags on the link, the region shown, completed food searches and result clicks, app-download clicks, and the fixed topic chosen when a support email is opened. The providers also receive browser and device details. Both may derive an approximate location from your IP address; PostHog then discards the address. PostHog receives the food search text; Google Analytics receives its length and result count, but never the text. Neither provider receives a name, email address, or message typed into the contact form.",
          "The website providers use pseudonymous browser identifiers to distinguish visits. The website does not send a RiceCal account identifier to either provider.",
          "If your browser sends a Do Not Track request, this website loads neither analytics provider and sends no analytics events.",
          "Counts of how many AI requests your account has made in the current month, which is how the fair-use ceiling is enforced.",
          "The app blocks the advertising identifier on Android and carries no advertising SDK on either platform.",
        ],
      },
      { kind: "h3", text: "What we do not collect" },
      {
        kind: "ul",
        items: [
          "Your precise location. RiceCal does not ask for location permission.",
          "Your contacts, your calendar, your microphone recordings or your camera roll at large. The camera is used only for the plate you point it at and the barcode you scan.",
          "Payment card details.",
          "Special category data beyond the health and body figures listed above, which you provide or connect yourself.",
        ],
      },
    ],
    id: "what-we-collect",
    title: "What we collect",
  },
  {
    blocks: [
      {
        kind: "table",
        headers: ["What we do", "What it uses"],
        rows: [
          [
            "Create and run your account",
            "Email, account identifier, sign-in provider",
          ],
          [
            "Work out your daily calorie and macro budget",
            "Height, weight, age, sex, target weight, activity level",
          ],
          [
            "Identify a meal from a photo, a sentence or a barcode",
            "The photo or description, and the barcode you scanned",
          ],
          [
            "Keep and show your diary, charts, streaks and reviews",
            "Your logged entries, weigh-ins, water and the foods you wrote",
          ],
          [
            "Extend your budget with movement",
            "Steps, workouts and calories burned from Apple Health or Health Connect",
          ],
          [
            "Remind you at the times you eat",
            "Your meal times and reminder settings, scheduled on the device itself",
          ],
          [
            "Unlock the features you paid for",
            "Your subscription status from RevenueCat",
          ],
          [
            "Keep the app working and fix what breaks",
            "Crash reports, error traces and product analytics",
          ],
          [
            "Widen the food catalogue",
            "Dishes and barcodes we could not match, recorded without your account identifier",
          ],
          [
            "Answer your support message",
            "The email you send us and what you put in it",
          ],
        ],
      },
      {
        kind: "p",
        text: "We do not use your diary, your photos, your body figures or your health readings to target advertising, and we do not build advertising profiles.",
      },
    ],
    id: "how-we-use",
    title: "How we use it",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "If you are in the UK, the European Economic Area, or somewhere with similar law, these are the bases we rely on.",
      },
      {
        kind: "ul",
        items: [
          "Performance of a contract: running your account, storing your diary, and giving you the features you subscribed to.",
          "Consent: reading Apple Health or Health Connect, sending notifications, and processing the health and body figures you give us, which are special category data. You can withdraw consent at any time in the app’s settings or in your device settings.",
          "Legitimate interests: keeping the app secure and working, understanding which features are used, enforcing fair-use limits on AI requests, and preventing abuse of the publishing feature.",
          "Legal obligation: keeping the records tax and consumer law require of us.",
        ],
      },
    ],
    id: "legal-bases",
    title: "Why we are allowed to (UK and EU)",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "Photo and text meal logging works by sending what you gave us to an AI model, through our own servers. Your phone never talks to the model directly.",
      },
      {
        kind: "ul",
        items: [
          "What is sent: the plate photo or the sentence you wrote, plus the prompt that tells the model what to look for. When a food is filled in for you, the text or photo you supplied.",
          "What is not sent: your name, your email, your account identifier, your body figures or the rest of your diary.",
          "Requests are routed through OpenRouter to the model provider that serves them. We select providers on API terms that do not permit your content to be used to train their models.",
          "The result comes back as a list of items, portions and nutrition figures, which is written into your diary and which you can correct line by line before or after saving.",
          "We keep the model’s working notes for a scan, so that a wrong result can be investigated and the catalogue improved. These are held against your entry, are never published, and go when your account goes.",
          "Where a dish or a barcode could not be matched, the search term or the code is recorded on a backlog so that we can add it. That backlog does not carry your account identifier.",
        ],
      },
      {
        kind: "note",
        text: "Calorie and macro figures produced this way are estimates. RiceCal is a wellness tool, not a medical device, and nothing it shows you is medical advice.",
      },
    ],
    id: "ai",
    title: "How photos and descriptions are processed",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "Health and fitness data gets stricter treatment than anything else in the app, both because it deserves it and because Apple and Google require it.",
      },
      {
        kind: "ul",
        items: [
          "Data read from Apple HealthKit or Android Health Connect is used only to show your activity inside RiceCal and to extend your daily calorie budget.",
          "It is never used for advertising, marketing, or any similar purpose.",
          "It is never sold, rented, or disclosed to data brokers or information resellers.",
          "It is not shared with any third party except the infrastructure providers listed below that store it on our behalf, and only ever to deliver the app to you.",
          "Disconnecting the health store in RiceCal’s settings stops all further reading and deletes the activity we synced from it.",
          "Weight readings you type yourself and weight readings synced from a health store are kept apart, so disconnecting a store never removes something you entered by hand.",
        ],
      },
    ],
    id: "health",
    title: "Health and fitness data",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "We do not sell your personal data. We share it only with the providers that make the app run, each under a contract that limits them to processing it on our instructions.",
      },
      {
        kind: "table",
        headers: ["Provider", "What it handles"],
        rows: [
          [
            "Supabase",
            "Accounts, authentication and your diary database",
          ],
          [
            "Cloudflare",
            "Meal photos in private object storage, the food catalogue, and the network in front of both",
          ],
          [
            "OpenRouter and its model providers",
            "Identifying a meal from a photo or a description",
          ],
          [
            "RevenueCat",
            "Subscription state, reported from the App Store and Google Play",
          ],
          [
            "Apple and Google",
            "Sign-in, payment, and the app stores themselves",
          ],
          [
            "PostHog",
            "Product analytics, crash and error reports, session replay, AI request records, and account email for support lookup",
          ],
          [
            "Google Analytics, through Firebase in the app",
            "App and website product analytics using pseudonymous device or browser identifiers; no name, email, search text or contact-form content from the website",
          ],
        ],
      },
      {
        kind: "p",
        text: "We may also disclose data where the law requires it, to establish or defend legal claims, or to protect the safety of our users. If RiceCal is ever sold or merged, your data may pass to the buyer under this same policy, and we will tell you before that happens.",
      },
      {
        kind: "p",
        text: "Google explains how it handles information from apps that use its analytics services here:",
      },
      {
        href: "https://policies.google.com/technologies/partner-sites",
        kind: "link",
        text: "How Google uses information from sites or apps that use its services",
      },
      {
        kind: "p",
        text: "A food you wrote is the one thing you can choose to make public. When you publish one, its name, ingredients, steps and pictures become visible to other users. Your email address is never shown. Making it private again removes it from the community shelf.",
      },
    ],
    id: "sharing",
    title: "Who else touches it",
  },
  {
    blocks: [
      {
        kind: "ul",
        items: [
          "Your account, diary, foods, photos and health history are kept for as long as your account exists.",
          "When you delete your account in the app, everything above is erased from the live systems the moment you confirm. A request sent to us by email instead is completed within 30 days.",
          "Encrypted backups may hold a copy for up to a further 30 days before they roll off.",
          "Crash reports, product analytics and AI request records are kept for up to 14 months, and session recordings for up to 30 days.",
          "Records we must keep for tax or accounting are kept as long as the law requires, and hold no diary content.",
          "The catalogue backlog of unmatched dishes and barcodes is anonymous and is kept indefinitely.",
        ],
      },
    ],
    id: "retention",
    title: "How long we keep it",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "Wherever you are, you can ask us for any of the following and we will answer within 30 days.",
      },
      {
        kind: "ul",
        items: [
          "A copy of the data we hold about you, in a portable format.",
          "Correction of anything that is wrong.",
          "Deletion of your account and everything attached to it.",
          "Restriction of, or objection to, a particular use.",
          "Withdrawal of a consent you gave, including the health connection and notifications.",
          "A complaint to your data protection authority, if we have not put something right. In the UK that is the ICO, in Malaysia the Personal Data Protection Department, and in the EU your national authority.",
        ],
      },
      {
        kind: "p",
        text: "If you are in California, we do not sell or share personal information as those terms are defined by the CCPA, and we do not discriminate against you for exercising any right. If you are in Malaysia or Singapore, the rights above are how we meet the PDPA in each.",
      },
      {
        kind: "p",
        text: `Write to ${CONTACT_EMAIL} from the address on your account and say which of these you want.`,
      },
    ],
    id: "rights",
    title: "Your rights",
  },
  {
    blocks: [
      {
        kind: "ul",
        items: [
          "Everything travels over TLS, and everything at rest is encrypted by our providers.",
          "Your diary is separated from every other diary at the database level, so one account cannot read another’s rows.",
          "Meal photos are held in a private bucket with no public URLs. A picture is served through a link that is signed for your account and expires shortly after it is issued.",
          "Sign-in is Apple, Google, or a single-use link sent to your email address. RiceCal has no passwords, so there are none of yours for us to lose.",
          "Access to production data is limited to what support and debugging require, and is logged.",
        ],
      },
      {
        kind: "p",
        text: "No system is perfect. If a breach affects your data we will tell you and the relevant regulator as the law requires.",
      },
    ],
    id: "security",
    title: "How it is protected",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "Our providers run in several regions, including Singapore, the European Union and the United States, so your data may be processed outside the country you live in.",
      },
      {
        kind: "p",
        text: "Where data leaves the UK or the EEA, we rely on the UK and EU Standard Contractual Clauses, or on an adequacy decision covering the destination.",
      },
    ],
    id: "transfers",
    title: "Where your data goes",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "RiceCal is not directed at children and is not for anyone under 16. We do not knowingly collect data from a child. If you believe a child has created an account, write to us and we will delete it.",
      },
      {
        kind: "p",
        text: "Calorie tracking is not appropriate for everyone. If you are pregnant, under 18, or have a history of disordered eating, please speak to a health professional before using an app like this one.",
      },
    ],
    id: "children",
    title: "Children and suitability",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "When this policy changes we update the date at the top of this page. If the change is significant, we will tell you in the app or by email before it takes effect.",
      },
      {
        kind: "p",
        text: `To ask anything, to exercise a right, or to complain, write to ${CONTACT_EMAIL}. You can also use the contact form on this site.`,
      },
    ],
    id: "changes",
    title: "Changes, and how to reach us",
  },
];

export default function PrivacyPolicy() {
  return (
    <LegalPage
      intro="A food diary is a record of your body and your day. This page says exactly what RiceCal collects, why, who else touches it, and how to get rid of it."
      sections={SECTIONS}
      title="Privacy Policy"
    />
  );
}
