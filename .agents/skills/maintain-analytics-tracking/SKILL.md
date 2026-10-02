---
name: maintain-analytics-tracking
description: Keep RiceCal's canonical README Mixpanel, GA4 and RevenueCat tracking tables synchronized when adding, changing, removing or reviewing analytics, identity, purchases or integration settings.
---

# Maintain RiceCal tracking

Read README.md's Analytics section before changing tracking. Its canonical app event, revenue/automatic event, identity/profile, live settings and verification tables are the source of truth. The typed Events plan enforces the code contract.

1. Review affected call sites, property types, provider mappings, production/preview gates, identity ordering and RevenueCat dashboard configuration.
2. Update every affected table in README.md in the same change. Include exact names for both providers, allowed properties, sources, send conditions, revenue owner, currencies and gross/net definitions. Remove retired rows and explain legacy fallback or rollout limits.
3. Never add app-side settled purchase revenue alongside RevenueCat. Verify Firebase installation IDs come from the native SDK, attribute delivery is acknowledged before native suppression, and sign-out/account switches invalidate pending work.
4. Keep SDK automatic events, RevenueCat profile writes and repeated delivery attempts separate from product event usage. Review volume bounds and avoid tracking renders/keystrokes or diary data.
5. Read live setup back after dashboard mutations. Record verification dates and actual evidence without credentials, private emails, customer IDs or fabricated transaction data. HTTP 200/204 alone is not proof of GA4 report ingestion.
6. Run the tracking inventory consistency test and pnpm check for code changes. Include relevant native purchase/restore checks and report any ingestion or platform gap honestly.
7. Keep this skill's .agents and .claude copies identical. PR descriptions must confirm the canonical tables were synchronized and state whether dashboard setup or app release is still pending.

All documentation stays in README.md. Do not create a parallel analytics document. Dashboard changes are not source-controlled: record their verified configuration and rollout implications in the canonical tables.
