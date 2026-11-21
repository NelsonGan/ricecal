---
name: image-generation
description: Generate or edit raster images (UI mockups, icons, illustrations, clay/3D renders, mascots, transparent cutouts, store art) with whichever image model is available, Codex's image_gen, Antigravity's generate_image or the agent's own image tool, on the user's existing subscriptions. Use whenever a task needs a new bitmap image or an AI edit of one, e.g. "generate an icon", "mock up this screen", "make an illustration", "edit this image", "remove the background". Not for SVG/vector work, diagrams, or charts that are better drawn in code.
---

# Image generation

Most coding agents cannot draw. Several agent CLIs on this machine can, each
through its own built-in image tool and billed to a subscription the user already
has, so no API key is needed. This skill wraps them in one script any agent can
call, and picks whichever one is installed and working.

| Backend | What draws | CLI | Good at |
|---|---|---|---|
| `codex` | Codex's `image_gen` | `codex` (or the copy inside ChatGPT.app) | real transparency, faithful edits, every committed RiceCal image so far |
| `antigravity` | Antigravity's `generate_image` (a Gemini image model) | `agy` | a second allowance when Codex's runs out; UI mockups and illustrations |

`generate-image.sh -l` lists the ones installed here. Being installed is not the
same as working: each has its own usage cap, and `auto` moves on to the next
backend when one fails.

## Which route to use

1. **You can draw yourself** (you are Codex with `image_gen`, Antigravity with
   `generate_image`, or any agent with an image tool): call your own tool. Running
   the script would only start a second agent. The brief and checking advice
   below still applies.
2. **You cannot** (Claude Code, Cursor and most others): run the script.
3. **Neither CLI works here but T3 Code lists an image-capable provider** (Codex
   or Antigravity in `orchestrator_capabilities`): delegate one task to that
   provider asking it to draw with its own tool and save to an absolute path you
   give it. Use the brief format below as the task.
4. **Nothing can draw:** say so once and carry on without the image. Do not block
   the task on it, and do not substitute a hand-written SVG or an HTML page.

## Run it

The script lives next to this file: `scripts/generate-image.sh`. From the repo
root that is `.agents/skills/image-generation/scripts/generate-image.sh`
(identical copy under `.claude/skills/`).

```bash
.agents/skills/image-generation/scripts/generate-image.sh -o <out.png> [options] "<brief>"
```

| Flag | Meaning |
|---|---|
| `-o PATH` | Output file (required). With `-n` > 1 you get `PATH-1.png`, `PATH-2.png`, ... |
| `-b NAME` | `codex`, `antigravity` or `auto` (the default; `IMAGE_BACKEND` sets it too). |
| `-n COUNT` | Variants, one generation call each. Each adds roughly 30-60 s. |
| `-t` | Real transparent background (alpha kept). Use for icons, stickers, cutouts. |
| `-i FILE` | Attach an image (repeatable). By default it is a style/subject **reference**. |
| `-e` | Make the first `-i` image the **edit target**: change only what the brief says. |
| `-m MODEL` | Model override for the backend's agent. Normally leave unset. |
| `-l` | List the backends installed on this machine. |

It prints the absolute path of each saved image on stdout and `backend: <name>`
on stderr. An image takes 30-90 s and two variants about 2 minutes, so give the
shell call a timeout of at least 5 minutes (about a minute more per extra
variant, and more again when `auto` may fall through to a second backend), or run
it in the background. For several **distinct** images, start separate
invocations in parallel rather than one long `-n` run.

- `auto` tries Codex first, then Antigravity, and moves on when one fails.
- With `-t`, an image that comes back without an alpha channel counts as a
  failure (an opaque sticker over the UI is a white box): it is kept beside the
  output as `<name>.opaque.png`, and `auto` tries the next backend.
- Fewer images than `-n` asked for is reported on stderr, not as a failure.
- **Keep one family on one backend.** A set that must look alike (food icons,
  exercise drawings, the screens of one feature) changes style when the model
  changes, so pin it with `-b` once the first image is approved, and pass that
  image back with `-i`.
- Output is PNG, usually square around 1254 px unless the brief asks for
  "landscape 3:2" or "portrait 2:3". A backend that returns JPEG or WebP for a
  `.png` path is converted with `sips`. Resize or crop afterwards
  (`sips -Z 512 in.png --out out.png`) when the project needs exact pixels.

Requirements: at least one backend CLI, signed in. Codex is found on `PATH` or
inside the ChatGPT/Codex desktop app (`CODEX_BIN` overrides); `agy` on `PATH` or
in Homebrew (`AGY_BIN` overrides).

### Adding a backend

A new image-capable CLI is one `run_<name>` function in the script that turns the
shared flags into that tool's call and prints the saved paths, plus its name in
`BACKENDS` and `available()`. Keep the flags identical across backends, so no
caller has to know which one drew.

## Writing the brief

The backend expands the brief itself, but a structured one gives far more
consistent results. Include only the lines that matter:

```text
Asset type: <where it will be used, e.g. 512px category icon in a mobile app>
Subject: <the thing, concretely>
Style/medium: <e.g. soft clay 3D render, matte, rounded forms>
Composition/framing: <centered, 3/4 view, fills ~80% of the canvas, no cropping>
Lighting/mood: <soft studio light from top-left, gentle ambient occlusion>
Color palette: <specific colours or "match the reference">
Text (verbatim): "<exact text>"   (omit when the image must contain no text)
Avoid: <text, watermark, background, drop shadow, extra objects>
```

For UI mockups, the `ui-mockups` skill has the brief and the workflow around it.

For a set that must look like one family, generate the first image, check it, then
pass it back with `-i` as a style reference for every later one and say "match the
style, lighting, palette and framing of the reference exactly". If the repo
already has art in the target style, pass one or two existing assets with `-i`
from the start.

## After generating

1. **Look at every output** before using it. Check subject, style, stray
   text/watermarks, cropping, and (for `-t`) that the background is really
   transparent (`sips -g hasAlpha file.png`).
2. If something is off, iterate with **one** targeted change: re-run with a
   sharpened brief, or run `-e -i <bad.png> "change only X; keep everything else"`.
3. Show the user the result before wiring it into the project, unless they said
   to go ahead.
4. Never overwrite an existing project asset unless asked; write a sibling
   (`icon-v2.png`) and let the user pick.
5. Generate drafts into a scratch/temp folder, not the repo, and copy only the
   chosen image in. (Mockups for a PR go in the gitignored `.github/pr-assets/`
   instead; see `ui-mockups`.) Then run whatever asset pipeline the repo uses (icon registry
   generators, compression, etc.).

## Where RiceCal art goes

Every RiceCal surface is in this repo, and each keeps its own copies:

- **The app**: `apps/mobile/assets/` (icons under `assets/icons/<set>/`, exercise
  art under `assets/exercises/`). It is the source for food and dish icons.
- **The website**: `apps/web/public/`. Its dish and food icons are copies of the
  app's (`public/icons/`). Copy a new one across rather than drawing a second
  version, and draw site pictures at the size they are shown, since the site has
  no image optimizer.
- **The App Studio**: `apps/app-studio/public/assets/app-store/` for store
  creatives. Record a generated creative's prompt, dimensions and checksum in
  `artwork-provenance.json`, or in `food-camera/catalog.json` for a food photo
  (README, *The App Studio*), and recompress PNGs with
  `oxipng -o 4 --nc --strip safe` before recording the checksum.

Every committed image stays in history forever, so commit only the chosen one.
Mockups are never committed; they go in the PR description (`ui-mockups`).

## Troubleshooting

- `No image backend found`: install Codex or the Antigravity CLI and sign in, or
  set `CODEX_BIN` / `AGY_BIN`. The ChatGPT desktop app ships Codex at
  `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`.
- `codex: no images generated`: read the last `agent_message` in the transcript
  it names. Usually a refused prompt, an expired login (the user runs
  `codex login`), or the image allowance, which is its own daily cap
  (`usage_limit_reached` with a `resets_at` in `run.jsonl.err`).
- `antigravity: the image model's quota is used up`: Antigravity's image model
  has a short rolling quota (`RESOURCE_EXHAUSTED`, with the reset time in the
  transcript). `auto` will already have tried Codex.
- Do not retry a failed backend in a loop; report the failure, or let `auto` move
  on.
- Codex may log MCP auth errors (e.g. a Cloudflare OAuth prompt) to stderr. They
  are harmless.
