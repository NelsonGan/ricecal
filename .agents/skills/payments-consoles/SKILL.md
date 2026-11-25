---
name: payments-consoles
description: Work with RiceCal's payment consoles: RevenueCat (MCP), App Store Connect (asc CLI) and Google Play (gplay CLI). Use when a purchase fails, when adding or changing products, offers or entitlements, when granting the Play service accounts, or when walking the purchase flow end to end on a simulator with RevenueCat's Test Store.
---

# Payments

Moved out of `AGENTS.md` so it loads for payment work.

## Payments

Three consoles, three tools: RevenueCat (MCP), App Store Connect (`asc` CLI),
Google Play (`gplay` CLI). Product identifiers differ per store and RevenueCat
holds both; the ids themselves are in those consoles.

- **Check the store, not RevenueCat, when a purchase fails.** A product listed
  "active" in RevenueCat is only an unarchived reference and may exist on no
  store at all.
- The RevenueCat MCP key cannot attach products to an entitlement (it lacks
  `project_configuration:entitlements:read_write` and answers 403). That step is
  a dashboard click; plan for it rather than discovering it mid-run.
- A Play offer needs both a top-level `regionalConfigs` and per-phase ones, plus
  `--regions-version` from `gplay pricing convert`, or it fails with "must target
  at least one region". The base plan must be ACTIVE first.
- Two Google service accounts exist deliberately, one for the `gplay` CLI and one
  for RevenueCat's purchase validation, so rotating either does not break the
  other. Each must be invited separately in Play Console under Users and
  permissions — a manual grant no CLI can do — and Google can take up to 36 hours
  to propagate it, so a rejection right after granting is usually that.
  `gplay auth doctor` says "No issues found" on an ungranted account because it
  only checks that the key file parses; test with
  `gplay edits create --package com.nelsongan.ricecal`. Two APIs are needed, not
  one: `gplay auth setup` enables `androidpublisher`, while `gplay apps list`
  goes through `playdeveloperreporting.googleapis.com` and 403s until that is
  enabled too.
- **The purchase flow can be walked end to end on a simulator** through
  RevenueCat's Test Store, switched on by `EXPO_PUBLIC_RC_TEST_STORE_KEY` in
  `.env.local`. It compresses periods (a "year" is an hour) and auto-renews, so
  do not wait for one to lapse. Its products carry no introductory offer, so a
  purchase comes back `active` rather than `trial`, and prices follow the device
  storefront, which is the tell that the test store is live. Clean-up rows come
  back: `reconcileEntitlement` refills them from RevenueCat on the next launch,
  which is the point of it.
