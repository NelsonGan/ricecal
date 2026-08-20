# App Store review notes: IAP and subscriptions

Paste-ready text for App Store Connect, plus the things to check before hitting
Submit. Everything below is derived from the code in this repo and the live
RevenueCat project (`RiceCal`, `projeb2883d3`), not from memory.

## What is actually being sold

One entitlement, `pro`, unlocked by any of three iOS products in the `default`
offering:

| Package | Product ID (iOS) | Type | Trial |
|---|---|---|---|
| `$rc_monthly` | `com.nelsongan.ricecal.pro.monthly` | Auto-renewable subscription, 1 month | 7 days |
| `$rc_annual` | `com.nelsongan.ricecal.pro.yearly` | Auto-renewable subscription, 1 year | 7 days |
| `$rc_lifetime` | `com.nelsongan.ricecal.pro.lifetime` | Non-consumable | none |

Bundle id `com.nelsongan.ricecal`, ASC app id `6795558595`.

The free tier is a working diary, which matters for review: the app is not a
locked demo. Free gets 3 photographed plates a day, unlimited barcode scanning,
catalogue search, quick add, 3 saved recipes, 7 days of trends and the latest
weekly review. Pro removes those ceilings and adds the typed-meal, correct-by-
describing, recipe-from-photo and what-to-eat features.

---

## 1. App Review Information → Notes

Paste this into the app-level review notes field.

```
RiceCal is a calorie diary for Malaysian food. Sign-in is required because
every diary entry, weigh-in and recipe belongs to an account and syncs across
devices.

DEMO ACCOUNT
Email: <REVIEW_ACCOUNT_EMAIL>
Password: <REVIEW_ACCOUNT_PASSWORD>
Sign in with "Continue with email", enter the address and password. No emailed
code is needed for this account. Apple Sign In also works if you prefer it, but
please use the demo account so the diary has data in it.

WHAT IS SOLD
A single subscription tier called RiceCal Pro, sold three ways:
  com.nelsongan.ricecal.pro.monthly   auto-renewable, 1 month, 7 day free trial
  com.nelsongan.ricecal.pro.yearly    auto-renewable, 1 year, 7 day free trial
  com.nelsongan.ricecal.pro.lifetime  non-consumable, one payment, no renewal
All three unlock the same "pro" entitlement. There is nothing else to buy, no
consumables and no advertising.

The app is fully usable without paying. A free account can photograph three
meals a day, scan barcodes without limit, search the food database, add meals
by hand, keep three recipes, see seven days of trends and read the most recent
weekly review. Pro raises those limits and adds four AI features: describing a
meal in words, correcting a logged meal in words, filling a recipe in from a
photo, and asking what to eat next.

HOW TO REACH THE PAYWALL
  1. Finish onboarding. The paywall is the last step, after the notifications
     screen. "Maybe later" leads to the working free app.
  2. Or, once inside: Me tab -> Subscription -> "Get RiceCal Pro".
  3. Or trigger a gate: tap the + button on Today -> "Describe" and type a
     meal. A free account is refused and the paywall opens.

The three plans are on one screen. Tapping Yearly or Monthly shows "Free for 7
days, then <price> a year/month"; tapping Lifetime changes the button to "Buy
lifetime access" and the small print to "One payment. No subscription, no
renewal", because the one-off purchase has no trial. Prices come from StoreKit,
so they are shown in the reviewer's own storefront currency.

RESTORE
"Restore purchase" is at the bottom of the onboarding paywall (scroll past the
small print) and is a footer button on the standing paywall reached from the Me
tab. Cancelling and switching plans open the App Store subscription settings,
since the payment relationship is with Apple.

VERIFYING THAT THE PURCHASE UNLOCKS CONTENT
After a sandbox purchase completes, the app waits a moment for the entitlement
to be confirmed and then shows a welcome screen. To confirm Pro is active:
open the + button on Today, choose "Describe", and type "nasi lemak with fried
chicken". A free account is refused with a paywall; a Pro account logs the meal.
Me -> Subscription will also show the active plan and the trial days remaining.

OTHER THINGS WORTH KNOWING
- Camera access is used to photograph meals and to scan barcodes. Both are
  optional; meals can be added by search or by hand.
- Apple Health is optional and asked for after the account exists. Declining it
  does not block anything. It is read-only: steps, workouts, active energy and
  weight, used to extend the daily calorie budget.
- Health data is never used for advertising and is never sent to any analytics
  service.
- Meal photographs are stored against the account and are visible only to that
  account. On a free account they are deleted after 30 days; the diary entry
  itself is kept.
```

Replace both `<REVIEW_ACCOUNT_*>` placeholders before submitting. Do not commit
the real credentials to this repo.

---

## 2. Per-product review notes

Each IAP in App Store Connect has its own Review Notes field. These are the
three.

### `com.nelsongan.ricecal.pro.monthly`

```
RiceCal Pro, billed monthly, with a 7 day free trial for new subscribers.
Unlocks the same "pro" entitlement as the yearly and lifetime products.

Pro removes the free tier's limits (3 photographed meals a day becomes
unlimited, 3 saved recipes becomes unlimited, 7 days of trends becomes up to a
year, meal photos are kept for good instead of 30 days) and adds four features:
describing a meal in words, correcting a logged meal in words, filling a recipe
in from a photo, and asking what to eat next.

To reach it: finish onboarding and the paywall is the final step, or from
inside the app go to the Me tab -> Subscription -> "Get RiceCal Pro". Select
"Monthly" on the plan picker. Restore purchase is on the same screen.

To confirm it unlocked: tap + on the Today tab, choose "Describe", type a meal
in words. Free accounts are refused here; Pro accounts log the meal.
```

### `com.nelsongan.ricecal.pro.yearly`

```
RiceCal Pro, billed yearly, with a 7 day free trial for new subscribers. This
is the plan selected by default on the paywall. Unlocks the same "pro"
entitlement as the monthly and lifetime products.

Pro removes the free tier's limits (3 photographed meals a day becomes
unlimited, 3 saved recipes becomes unlimited, 7 days of trends becomes up to a
year, meal photos are kept for good instead of 30 days) and adds four features:
describing a meal in words, correcting a logged meal in words, filling a recipe
in from a photo, and asking what to eat next.

The "SAVE x%" badge on this plan is computed at runtime from the live monthly
and yearly StoreKit prices, so it always matches the two figures beside it.

To reach it: finish onboarding and the paywall is the final step, or from
inside the app go to the Me tab -> Subscription -> "Get RiceCal Pro". "Yearly"
is preselected. Restore purchase is on the same screen.

To confirm it unlocked: tap + on the Today tab, choose "Describe", type a meal
in words. Free accounts are refused here; Pro accounts log the meal.
```

### `com.nelsongan.ricecal.pro.lifetime`

```
RiceCal Pro as a one-off, non-consumable purchase. One payment, no renewal and
no trial, which is why selecting it changes the button to "Buy lifetime access"
and the small print to "One payment of <price>. No subscription, no renewal."
It unlocks the same "pro" entitlement as the two subscriptions.

It is restorable: "Restore purchase" is at the bottom of the onboarding paywall
and is a footer button on the standing paywall reached from the Me tab. It is
tied to the signed-in RiceCal account as well as the Apple ID, so it follows the
user to a new device once they sign in.

To reach it: finish onboarding and the paywall is the final step, or from
inside the app go to the Me tab -> Subscription -> "Get RiceCal Pro". Select
"Lifetime" on the plan picker.

To confirm it unlocked: tap + on the Today tab, choose "Describe", type a meal
in words. Free accounts are refused here; Pro accounts log the meal.
```

---

## 3. Two things that will fail review as the code stands

Both are in this repo rather than in App Store Connect, and neither is fixed by
anything written above.

### 3.1 A sandbox purchase does not unlock Pro (blocker)

App Review buys in the StoreKit sandbox. `apps/supabase/functions/revenuecat/index.ts`
drops any webhook event whose `environment` is not `PRODUCTION`:

```ts
if (event.environment && event.environment !== 'PRODUCTION') {
  return json({ ok: true, ignored: `${event.environment} environment` })
}
```

That guard is correct in general (a free sandbox purchase must not grant the
paid tier) but it means the reviewer's purchase never writes `subscriptions`,
which is the only thing `useEntitlement` and the server's `requireEntitlement`
read. The reviewer pays, `useAwaitEntitlement` polls and gives up, and every Pro
feature goes on refusing. That is the standard 3.1.1 / 2.1 rejection: "the
in-app purchase did not unlock any content".

The narrow fix is to allowlist the review account rather than to open the guard.
Add the demo account's Supabase uuid to an env var and let non-production events
through for that id alone:

```ts
const reviewIds = (Deno.env.get('REVIEW_APP_USER_IDS') ?? '').split(',').filter(Boolean)
if (event.environment && event.environment !== 'PRODUCTION' && !reviewIds.includes(appUserId)) {
  return json({ ok: true, ignored: `${event.environment} environment` })
}
```

Note that this needs `appUserId` resolved before the environment check, so the
two blocks swap order. Anyone else's sandbox purchase is still dropped.

The alternative is a RevenueCat promotional grant on the demo account so it is
Pro before review begins. It is one dashboard action and no code, but the
reviewer then never sees a purchase unlock anything, which is its own risk on a
first submission.

### 3.2 No Terms of Use or Privacy Policy links on the paywall (blocker)

Guideline 3.1.2 requires an auto-renewable subscription's purchase screen to
carry functional links to the privacy policy and to the terms of use (Apple's
standard EULA is acceptable). Grepping `apps/mobile/src` and `apps/mobile/app`
for `privacy`, `terms` or `eula` returns nothing in any paywall or settings
screen, and there is no policy URL anywhere in the repo.

What is already correct on that screen: the subscription name, the length of
the period, the price, the per-month figure for the yearly plan, and small print
that states the trial length and what is charged afterwards. What is missing is
only the two links. They need to be on `ProPitch` (so both paywalls get them),
and the same two URLs go into the App Store Connect metadata fields.

---

## 4. Before submitting

- [ ] A privacy policy is published and its URL is in App Store Connect, in the
      app metadata and on the paywall.
- [ ] Terms of use is linked on the paywall (Apple's standard EULA is fine).
- [ ] The demo account exists, has a password set, has a few days of logged
      meals in it, and its credentials are in the review notes.
- [ ] The demo account's uuid is in `REVIEW_APP_USER_IDS` on the edge functions,
      or it holds a RevenueCat promotional grant.
- [ ] All three products are in the "Ready to Submit" state and attached to this
      version of the build.
- [ ] Both subscriptions are in one subscription group with a localised display
      name and description, and the group's ranking is set (yearly above
      monthly, so an upgrade is an immediate switch rather than a downgrade).
- [ ] The 7 day free trial exists as an Introductory Offer on both subscriptions
      in App Store Connect. RevenueCat reports `trial_duration: null` on all six
      products, so the trial lives entirely in the store configuration and the
      app's "Free for 7 days" copy is asserting it rather than reading it.
- [ ] A screenshot of the paywall is uploaded for each product's review screen.
- [ ] `REVENUECAT_WEBHOOK_TOKEN` is set on the edge functions and matches the
      RevenueCat dashboard's webhook, and the App Store Connect API key is
      uploaded to RevenueCat (it is: `app_store_connect_api_key_configured` and
      `subscription_key_configured` are both true as of writing).
