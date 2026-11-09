---
name: create-pr
description: Create a pull request or rewrite an existing PR description with a one-line summary, plain-language changes, verification evidence, and possible regression risks. Use when asked to open a PR or improve its title or description.
---

# Create a PR

Write for a reviewer who has not seen the conversation. Describe the final change in plain English, with short sentences and no jargon in the summary or change bullets.

## Prepare

- Read the repository instructions and any PR template. Inspect the branch, working tree, full diff against the target branch, and existing PR before writing.
- Review the actual changes and available verification results. Run the checks required by the repository for code changes; when only rewriting a description, reuse verified results for the same code and identify any gaps.
- When creating a PR, commit only the intended changes, follow the repository's branch and commit conventions, and push the branch. Preserve unrelated work. When rewriting a PR, update that PR instead of opening a duplicate or making unrelated code changes.

- For analytics or RevenueCat integration changes, apply `maintain-analytics-tracking`, synchronize the canonical README tables, run the inventory test, and report dashboard verification and any remaining app-release or ingestion gap.

## What the merge ships

This repo holds every RiceCal component, and a merge to `main` ships different
things depending on the paths the diff touches. Say which ones apply, in plain
words, wherever the reviewer will look before merging:

- `apps/mobile`, `apps/supabase`, `packages/` or anything else not listed below:
  `deploy.yml` builds and submits a new app to both stores. Changes under
  `apps/supabase` also apply their migrations and redeploy every edge function.
- `apps/cloudflare/**`: `cloudflare.yml` applies the D1 schema, then deploys the
  Workers. No app build.
- `apps/web/**`: the **Web** workflow (`web.yml`) checks, builds and deploys
  ricecal.app. No app build.
- `apps/app-studio/**`: the **App Studio** workflow (`app-studio.yml`) tests
  and builds it, and nothing deploys. Store assets change only when someone
  uploads them.

A PR that spans several of these ships each one, and the order matters when one
reads what another writes (README, *Deploying*).

## Description

Start with one sentence explaining what the PR achieves. No Summary heading is needed. Then use these sections, with a blank line before each list:

### What changed

- Describe each meaningful change or fix as a straightforward bullet about behavior or outcome.
- Group related work. Avoid a file-by-file inventory, implementation names, acronyms, and narration of the development process.

### Verification

- State what was actually tested, where, and the result. For mobile apps, name the platform/device or simulator and whether the backend was local, staging, or production when relevant.
- Include useful evidence: screenshots or recordings for visible changes when available, test results, or a short description of the flows checked. Include before/after images only if both were captured.
- **Upload images and videos as GitHub attachments with `gh`'s `--attach`; never commit them.** Save captures in `.github/pr-assets/<topic>/` (one kebab-case folder per PR, ignored by git) or anywhere outside the repository. Reference each one in the description by its local path, `![Diary after the fix](.github/pr-assets/diary-water-row/after.png)`, and pass the same path to `--attach` on `gh pr create`, `gh pr edit` or `gh pr comment`: `gh` uploads the file and rewrites the reference to its GitHub URL. Repeat `--attach` per file (up to 50 per command). A file the description does not reference is appended at the end, with the text after `#` as its alt text (`--attach './after.png#Alt text'`).
- To add screenshots to an existing PR, run `gh pr edit <number> --body-file <file> --attach <path> …` with the full new description; without `--body-file`, `gh pr edit --attach` appends the images to the current one. If some uploads fail, `gh` still updates the PR with the ones that worked and exits non-zero: read the description back (`gh pr view <number> --json body`) and confirm every image became a `https://github.com/user-attachments/...` URL and none is still a local path.
- Only images and videos can be attached. Put other evidence (measurements, logs, test output) in the description as text: a table, a code block, or a collapsed `<details>` block when it is long.
- Never commit PR evidence, under `.github/pr-assets/` or anywhere else (a `docs/` folder, an app's `assets/`): committed evidence once made every clone 101 MB bigger. For the website or the App Studio, a headless Chrome screenshot of the dev server is enough (commands in `work-on-website` and `work-on-app-studio`); for the website, show a phone width, and both colour schemes when styling changed.
- Link or embed only evidence that a PR reviewer can access. Local filesystem paths do not work on GitHub. Do not invent attachments, expose private account data, or claim unrun checks passed. If an image cannot be attached, report the observed UI checks instead.
- Call out relevant untested platforms or paths. Distinguish automated checks from manual verification and pending CI.

### Possible regression risks

- Name concrete existing behavior that could break because of this diff, plus the checks that reduce the risk or any remaining gap. Use plain language.
- Keep this proportional to the change. For instructions-only work, say there is no app behavior change and identify any workflow risk if relevant. Do not claim zero risk for app changes or list unrelated hypothetical problems.

Add another section only when needed for a reviewer to make a decision, such as a required app rebuild, release order, data change, or follow-up. Explain technical requirements in everyday language; keep precise commands or identifiers in verification or release notes only where useful.

## Publish and verify

Use a concise title about the result. Keep required repository template fields while preserving the content above. Write the exact body to a temporary file and use `gh pr create --body-file` or `gh pr edit --body-file`, or pass a structured body to an available tool. Existing authorization to create or update the PR is sufficient; the skill does not authorize merging or deploying.

Read the published title and body back to verify formatting, links, and accuracy. Return the PR link.
