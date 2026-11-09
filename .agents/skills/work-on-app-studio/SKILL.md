---
name: work-on-app-studio
description: Work in the RiceCal App Studio, apps/app-studio of this repo, the Next.js tool that builds the App Store and Google Play listing assets (iPhone, iPhone Duo, iPad and Apple Watch screenshots, the App Store header and search creatives, the Play feature graphic and icon) and the listing text, in 26 languages, and uploads them through the asc and gplay CLIs. Use when changing store screenshots, gallery headlines, store descriptions, keywords or creatives, replacing app captures, exporting or uploading store assets, or checking what the store listing says.
---

# The App Studio (`apps/app-studio`)

The studio lives in this repo at `apps/app-studio`, package `@ricecal/app-studio`.
It was its own repository (`NelsonGan/ricecal-screenshots-creator`) until
November 2026. That repo and any `~/Projects/ricecal-screenshots-creator`
checkout are retired, so do not edit them. Old PR numbers in its history
(`(#31)` and below) name PRs in that old repository, not here.

The reference is the root README's **The App Studio** section. Read the part you
are touching first. For the What's New note, use `update-whats-new` instead of
this skill.

## Commands

```sh
pnpm install                                          # once, at the root; pnpm only
pnpm studio:dev                                       # http://localhost:3001
pnpm --filter @ricecal/app-studio test                # 37 tests: copy, mappings, upload rules, captures
pnpm --filter @ricecal/app-studio typecheck
pnpm --filter @ricecal/app-studio check:screenshots   # every capture against capture.json
pnpm check                                            # the whole repo, studio included
```

It runs on port 3001 so it can sit beside the website on 3000, and listens on
`127.0.0.1` only. `src/middleware.ts` refuses API calls from any other host,
origin or site, and non-JSON writes; `stageLocale` refuses locale and file
names that could leave the staging folder. A new route keeps all of that. Biome skips it,
and it has no linter of its own. Stop the server when you are done
(`kill $(lsof -tnP -iTCP:3001 -sTCP:LISTEN)`).

## Where things are

| To change | Edit |
|---|---|
| Gallery headlines, 26 languages | `src/scenes/locales/<lang>.ts` (English is `en.ts`, the source) |
| Header and search creative copy | `src/scenes/appStoreCopy.ts` |
| Scene order and layout | `src/scenes/sceneData.tsx`, `ipadSceneData.tsx`, `duoSceneData.tsx` |
| Store descriptions and What's New | `src/data/appDescriptions.ts` (What's New: `update-whats-new`) |
| Names, subtitles, keywords, URLs | `src/components/DescriptionsView.tsx` |
| Palette | `src/components/tokens.ts`, copied from `apps/mobile/global.css` |
| App captures | `public/assets/screenshots-iphone{,-duo}/<lang>/`, `public/assets/screenshots-watch/en/` |
| Play listing icon | `public/assets/icons/play_store_512.png` |

- **Copy follows the app's rules.** Two lines per headline, split with `\n`,
  plain sentences, no em or en dashes, never a telling off. No price or trial
  length, because the store prints both. When a feature or a screen name changes
  in `apps/mobile`, change the headline that names it in every language.
- **The palette is the app's.** When `apps/mobile/src/theme/tokens.ts` changes a
  colour the studio uses, change `tokens.ts` here in the same PR.

## Looking at it

Open `http://localhost:3001` with the T3 preview tools, or take a headless
Chrome screenshot:

```sh
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$C" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$TMPDIR/chrome-studio" \
  --window-size=1440,900 --virtual-time-budget=20000 --screenshot="$TMPDIR/studio.png" http://localhost:3001/
```

**An export needs a visible, foreground tab.** Rasterizing waits on
`requestAnimationFrame`, which a hidden tab never fires, so an export in a
background window hangs with no error. Check copy that might overflow in the
longest languages (German, Russian, Tamil) as well as English. `useFitText`
shrinks a headline rather than letting it wrap into the phone.

## Replacing captures

Captures are native screenshots of the app, 1320 × 2868 for iPhone and
2853 × 2007 for iPhone Duo, with fixed filenames (`01-today.png` …
`06-recipes.png`). They come from the seeder branches in this repo
(`screenshots/refresh-1-1-0`, `screenshots/iphone-duo`), which seed local
Supabase with each language's account and food. Those branches' instructions
were written for dedicated simulators. Lease devices through the Simlock pool
instead (`simlock-devices`, `device_open`), as AGENTS.md requires.

Then, for every replaced file:

1. Recompress it losslessly: `oxipng -o 4 --nc --strip safe <file>`
   (`brew install oxipng`).
2. Record its new `sha256` and the capture details in that set's `capture.json`.
3. Run `check:screenshots` and `test`.

Captures are most of this repo's size, and every version stays in history
forever. Replace a set in one commit rather than over several, and never commit
exported ZIPs or `.upload-staging/`.

## Uploading to the stores

An upload changes the live listing, or the version under review, so **only
upload when the user asks**, and always run `--dry-run` first and show them
what it would send. From `apps/app-studio`:

```sh
pnpm upload:ios -- --dir ./ricecal-screenshots-all --device phone --dry-run
pnpm upload:android -- --dir ./ricecal-screenshots-all --device phone --dry-run
```

- The CLIs hold the credentials: `asc` (keychain, `asc doctor`) and `gplay`
  (`~/.gplay`, `gplay doctor`). The studio's `.env.local` only names the app;
  copy it from `.env.local.example`. Never put a key in the repo.
- iOS needs an editable App Store version (`PREPARE_FOR_SUBMISSION` or
  rejected). Filipino has no App Store locale. Play takes eight screenshots per
  gallery and commits one edit per run.
- `--dir` is the unzipped **Export All Locales** folder, one folder per locale.
  The single-locale ZIP has a different shape.

## Shipping

Nothing deploys the studio, and assets reach the stores only through an
upload. The **App Studio** workflow (`.github/workflows/app-studio.yml`, job
`App Studio · Test and build`) runs on every PR and push that touches it: the
tests (with ffmpeg), `check:screenshots`, the typecheck and a production build.
`deploy.yml` ignores `apps/app-studio/**`, so a studio-only PR neither runs the
app's tests nor ships an app build. Attach a screenshot of the changed view to
the PR with `gh pr edit --attach`; never commit it (`create-pr`).
