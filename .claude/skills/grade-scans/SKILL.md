---
name: grade-scans
description: Grade the RiceCal scan pipeline against the deployed functions with pnpm eval:scan. Use before and after changing a scan prompt, the cascade or the model routing: the eval account's 100 scans a day, the two known flaky cases, calorie and macro bands, and cached photo cases.
---

# Grading the scan pipeline

Moved out of `AGENTS.md` so it loads for scan pipeline work.

## Grading the scan pipeline

`pnpm eval:scan` drives the deployed functions the way the app does, with the
cascade's `debug: true` trace on every call. **Always `--repeat` when you change
something** — one pass is not a measurement.

- **The account is capped at 100 scans a day.** The full suite at `--repeat=3` is
  90, so a second long run that day dies partway and every remaining case reports "Daily scan
  limit reached", which reads as a catastrophic regression rather than a quota
  because the cases that already ran passed. Check for that string before
  believing a wall of failures; clear `public.scan_usage` for the eval user to
  reset.
- Two cases are about 50% flaky on identical code and always have been (the
  roti canai photo's portion weight, and the part count on halving a nasi
  lemak). Do not read either as a regression without a control run.
- Cases state a calorie band, not a figure, and may band a macro too: a
  double-counted plate was defensible on calories and twice the dish on protein.
- Photo cases carry a source URL and cache into a gitignored directory rather
  than committing someone else's photographs.
