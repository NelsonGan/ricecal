import type { Metadata } from "next";

import { LegalPage, type LegalSection } from "@/components/legal";
import { pageMetadata } from "@/lib/seo";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  description:
    "The terms you agree to by using RiceCal: what the app is, what a subscription buys, what the calorie figures are and are not, and how either side can end it.",
  path: "/terms",
  title: "Terms of Use",
});

const SECTIONS: LegalSection[] = [
  {
    blocks: [
      {
        kind: "p",
        text: `These terms are the agreement between you and Nelson Gan, who operates ${SITE_NAME} (“RiceCal”, “we”, “us”). They cover the RiceCal mobile app, this website, and everything either of them gives you access to.`,
      },
      {
        kind: "p",
        text: "By creating an account or using the app you accept these terms. If you do not accept them, please do not use RiceCal.",
      },
      {
        kind: "p",
        text: "You must be at least 16 years old to use RiceCal. If you are under 18, use it with a parent or guardian’s agreement.",
      },
    ],
    id: "agreement",
    title: "The agreement",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "RiceCal is a food diary. It estimates the calories and macronutrients in what you eat, from a photograph, a written description, a barcode, or the food catalogue, and keeps a record of it alongside your weight, your water and any activity you connect.",
      },
      {
        kind: "note",
        text: "RiceCal is a general wellness product. It is not a medical device, it does not diagnose, treat, cure or prevent any condition, and nothing it shows you is medical, nutritional or dietary advice. Talk to a qualified professional before making decisions about your health, and especially before starting a calorie deficit if you are pregnant, breastfeeding, under 18, managing a medical condition, or have a history of disordered eating.",
      },
      {
        kind: "p",
        text: "Every calorie and macro figure in RiceCal is an estimate. Food varies, portions vary, cooking varies, and a photograph is an inference. Figures come from public food composition tables, product databases, our own research, and AI estimation, and any of those can be wrong. Check the numbers against your own judgement, and correct them in the app when they are off. Do not rely on RiceCal where an accurate figure matters clinically, such as managing diabetes or an allergy.",
      },
      {
        kind: "p",
        text: "Allergen and ingredient information, where shown, comes from third-party sources and may be incomplete or out of date. Never rely on RiceCal to decide whether a food is safe for you to eat.",
      },
    ],
    id: "what-it-is",
    title: "What RiceCal is, and what it is not",
  },
  {
    blocks: [
      {
        kind: "ul",
        items: [
          "You need an account to log food. You can create one with Apple, Google, or a link sent to your email address.",
          "Keep your account to yourself. Anything done through it is treated as done by you.",
          "Give us an email address that reaches you. It is how we would tell you about a problem with your account.",
          "One account per person. Do not share, sell or transfer an account.",
          "Tell us at once if you think somebody else has got into your account.",
        ],
      },
    ],
    id: "accounts",
    title: "Your account",
  },
  {
    blocks: [
      { kind: "h3", text: "What is free, and what is not" },
      {
        kind: "p",
        text: "Searching the catalogue, reading a dish’s calories and macros, scanning a barcode to see what is in a packet, and reading and editing entries you already have, are all free. RiceCal Pro is what lets you write a new entry into your diary, whichever of the four ways in you use.",
      },
      { kind: "h3", text: "Plans and prices" },
      {
        kind: "ul",
        items: [
          "RiceCal Pro is available as a monthly or yearly subscription, or a one-time lifetime purchase.",
          "Prices are shown in the app in your own currency, taken directly from the App Store or Google Play at the moment you look. We do not quote prices on this website, because the store’s figure is the one you will actually be charged.",
          "A subscription renews automatically at the end of each period unless you cancel it at least 24 hours before the period ends.",
          "Payment is charged to your Apple or Google account when the purchase is confirmed.",
          "Manage or cancel a subscription in your App Store or Google Play account settings. We cannot cancel it for you, and deleting the app does not cancel it.",
          "If we change a price, the change applies from your next renewal, and the store will tell you before it takes effect.",
        ],
      },
      { kind: "h3", text: "Refunds" },
      {
        kind: "p",
        text: "Purchases are made through Apple and Google, so refunds are theirs to give under their own policies. We cannot issue a refund for a store purchase. If something has gone wrong, write to us anyway and we will help you make the case, or fix the problem if it is ours.",
      },
      {
        kind: "p",
        text: "If you are a consumer in the UK or the EU, you have a statutory right to cancel a digital purchase within 14 days. By starting to use RiceCal Pro immediately you agree that performance begins straight away, which may end that right early. Nothing here limits a right you have by law.",
      },
      { kind: "h3", text: "If your subscription ends" },
      {
        kind: "p",
        text: "Your history stays yours. A lapsed subscription never locks you out of your own diary: everything you logged remains readable, editable and exportable. What stops is writing new entries.",
      },
    ],
    id: "pro",
    title: "RiceCal Pro and payment",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "Photo and text logging uses AI models, which cost us money per request. There is a fair-use ceiling on how many AI requests one account can make in a month. It is set well above ordinary use, and you will only ever meet it by automating or abusing the feature.",
      },
      {
        kind: "p",
        text: "If you reach it, the app tells you and asks you to get in touch. We do not silently guess a figure and put it in your diary instead.",
      },
    ],
    id: "fair-use",
    title: "Fair use of AI features",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "Your diary, the foods you write and your photos are yours. You keep every right in them. By using RiceCal you give us the limited licence we need to store that content, process it, and show it back to you, and nothing further.",
      },
      {
        kind: "p",
        text: "If you choose to publish a food to the community shelf, you additionally give us and other users a non-exclusive, worldwide, royalty-free licence to display, save and cook from it inside RiceCal, for as long as it is published. Make it private again and that licence ends for new uses. Copies other users have already saved stay in their own diaries, because their diary is theirs.",
      },
      {
        kind: "p",
        text: "Do not publish anything you do not have the right to publish. Do not publish anything that is not food you cook: adverts, links, spam, abuse, hate, or text that is not food at all. Published foods are reviewed automatically before they appear, and anything that fails is not shown. Editing a published one sends it back for review.",
      },
      {
        kind: "p",
        text: "The app itself, its name, its mascot, its design system, the catalogue we assembled, and everything else we made, remain ours. You may not copy, resell, decompile, scrape or reverse engineer it, except where the law says you may.",
      },
      {
        kind: "p",
        text: "Some catalogue data comes from open sources, including Open Food Facts under the Open Database Licence and public food composition tables. Attribution is shown on the dish that uses it, and those licences apply to that data rather than these terms.",
      },
    ],
    id: "content",
    title: "Your content, and ours",
  },
  {
    blocks: [
      { kind: "p", text: "Do not use RiceCal to:" },
      {
        kind: "ul",
        items: [
          "break the law, or help anybody else break it;",
          "get into another user’s account, or another user’s diary;",
          "scrape, bulk download or resell the food catalogue;",
          "put deliberately false nutrition data into the community shelf;",
          "automate the app, or run it through anything other than the official iOS and Android clients;",
          "attack, overload or probe our servers, or work around a rate limit;",
          "upload anything unlawful, abusive, or that infringes somebody else’s rights.",
        ],
      },
      {
        kind: "p",
        text: "We may suspend or close an account that does any of this, and we will tell you why when we can.",
      },
    ],
    id: "acceptable-use",
    title: "What you must not do",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "RiceCal can read Apple Health or Health Connect if you connect it, and can send you meal, weekly and monthly reminders if you allow notifications. Both are optional, both are asked for on the device, and both can be turned off there at any time. Turning either off does not affect the rest of the app.",
      },
      {
        kind: "p",
        text: "How that data is handled is set out in the Privacy Policy.",
      },
    ],
    id: "permissions",
    title: "Health data and notifications",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "We work hard to keep RiceCal running, but it is provided “as is” and “as available”. We do not promise it will be uninterrupted, error free, or that every figure in it is accurate. Features may change, and features may go.",
      },
      {
        kind: "p",
        text: "To the fullest extent the law allows, we are not liable for indirect or consequential loss, for lost data where you could have kept your own copy, or for any decision you made about your health on the strength of a figure in the app. Where liability cannot be excluded, it is limited to what you paid us in the twelve months before the claim.",
      },
      {
        kind: "p",
        text: "Nothing here excludes liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot lawfully be excluded. If you are a consumer, your statutory rights are unaffected.",
      },
    ],
    id: "liability",
    title: "Availability and liability",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "You can stop using RiceCal at any time, and you can ask us to delete your account and everything in it. The Data Deletion page says how.",
      },
      {
        kind: "p",
        text: "We may suspend or close an account that breaks these terms, or withdraw the service entirely with reasonable notice. If we withdraw it, we will give you a way to take your data with you.",
      },
      {
        kind: "p",
        text: "Cancelling a subscription and deleting an account are different things. Cancelling stops the billing; deleting removes the data. Do both if you want both.",
      },
    ],
    id: "ending",
    title: "Ending it",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "Apple and Google are not parties to this agreement and are not responsible for RiceCal. Apple has no obligation to provide support for the app. If the iOS app fails to conform to any warranty, you may tell Apple and Apple will refund the purchase price; beyond that Apple has no other warranty obligation. Any claim about the app, including product liability, a failure to meet a legal requirement, or a consumer protection claim, is ours to answer rather than Apple’s. Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce them against you.",
      },
      {
        kind: "p",
        text: "You confirm you are not located in a country subject to a US Government embargo, and that you are not on any US Government restricted-parties list.",
      },
      {
        kind: "p",
        text: "Your use of the app must also comply with the App Store Terms of Service or the Google Play Terms of Service, as applicable.",
      },
    ],
    id: "stores",
    title: "The app stores",
  },
  {
    blocks: [
      {
        kind: "p",
        text: "We may update these terms as the app changes. The date at the top of this page says when they last changed, and we will tell you in the app or by email before a significant change takes effect. Carrying on using RiceCal after that is acceptance of the new terms.",
      },
      {
        kind: "p",
        text: "These terms are governed by the laws of Malaysia, and the courts of Malaysia have jurisdiction. If you are a consumer somewhere else, you keep the protection of the mandatory laws of the country you live in, and may bring proceedings there.",
      },
      {
        kind: "p",
        text: "If any part of these terms turns out to be unenforceable, the rest of them stand.",
      },
      {
        kind: "p",
        text: `Questions about these terms go to ${CONTACT_EMAIL}.`,
      },
    ],
    id: "changes",
    title: "Changes, law and contact",
  },
];

export default function TermsOfUse() {
  return (
    <LegalPage
      intro="Plain terms for a food diary. What the app is, what a subscription buys, what the numbers are worth, and how either of us can walk away."
      sections={SECTIONS}
      title="Terms of Use"
    />
  );
}
