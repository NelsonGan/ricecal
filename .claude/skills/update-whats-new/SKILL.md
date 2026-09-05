---
name: update-whats-new
description: Write the store What's New note for a RiceCal release and open a PR on ricecal-screenshots-creator. Reads the note that is live, finds the ricecal commits it does not cover, and rewrites the note in all 23 listing locales. Use when asked to update the What's New / release notes / store note, or to say what changed in the new version.
---

# What's New

The App Store and Play both show a short note beside a release. Both copies come
from one place: `src/data/appDescriptions.ts` in the sibling repo
`~/Projects/ricecal-screenshots-creator`, where every locale carries a
`whatsNew` string. The Descriptions view uploads it; nothing else writes it.

This skill goes: find where the last note stopped, read the ricecal PRs merged
since, write the note, translate it, verify it, open a PR. It never uploads to
a store. Someone presses that button.

Both repos are on `main` and both are pushed to `NelsonGan/*`. The work happens
in `ricecal-screenshots-creator`; only the reading happens in `ricecal`.

## 1. Find where the last note stopped

The note is not cumulative and carries no date, so the boundary is written down
rather than inferred. It is written in the **PR body**, as a last line reading
`Covers: ricecal#136, ricecal#137`.

**It cannot live in the commit body.** Squash merging this repo keeps the
subject and throws the body away: `git log -1 --format=%B 0616027` is one line,
though that commit's branch had a full body. Step 7 writes the line into both
and only the PR copy is expected to survive.

```sh
cd ~/Projects/ricecal-screenshots-creator
git checkout main && git pull --ff-only
git log -3 --format='%h %s' -- src/data/appDescriptions.ts
```

Take the newest subject that is about the note, read the `(#N)` off it, then:

```sh
gh pr view <N> --json body -q .body | grep '^Covers: ricecal#'
```

The highest `ricecal#N` on that line is the last thing the live note describes.

Two fallbacks, in order:

1. **Any `ricecal#` reference in that body.**
   `gh pr view <N> --json body -q .body | grep -o 'ricecal#[0-9]*' | sort -u`.
   This is how the notes written before this skill are readable at all; PR #2
   named its two in prose.
2. **The commit date.** `git log -1 --format=%ad --date=short <sha>`, then in
   ricecal `git log --since=<that date>`. Least reliable, because a PR can merge
   days after the work it describes. Read the range before trusting it.

## 2. Read what has happened since

```sh
cd ~/Projects/ricecal
git pull --ff-only
git log --format='%h %ad %s' --date=short $(git log --format=%h --grep='(#<N>)' -1)..HEAD
```

Subjects are compressed to the point of being misleading about scope. Open the
body of each candidate before writing a word about it:

```sh
gh pr view <n> --repo NelsonGan/ricecal --json title,body,mergedAt
```

Note which side of the version bump each one landed. `Take the app to 1.0.x`
commits are the cut. A change merged after the cut is not in the binary the
store is about to show, so it either waits for the next note or the note goes
out with the next build. Say which in the PR body; do not decide it silently.

## 3. Keep only what a person using the app would notice

In: a new way to do something, a screen that behaves differently, a fix to
something that was visibly wrong.

Out, every time: version bumps, CI and release plumbing, backend compatibility
work, schema and Worker changes nobody sees, catalogue loads, comments, tests,
`AGENTS.md` and `README.md`. A release with nothing in the "in" column gets no
new note; leave the live one alone and say so rather than padding.

Two to four bullets is the shape. If six things landed, the note takes the
three worth reading and drops the rest.

## 4. Write the English note

`en` is the source. The shape, unchanged since the first note:

```
- <one change, one line>
- <one change, one line>

<closing line>
```

- **One short sentence per bullet.** Ten words is a good bullet and twenty is a
  paragraph. What runs long is the tail: the clause saying what the change is
  for, which the reader worked out from the first half. Cut it.
- **Do not write all three the same way.** Three bullets of the same length,
  each joining two halves with "and", reads as machine-written even when every
  word of it is true. Let one be four words. Prefer the plain verb (keep, add,
  write) to the considered one (carries, covers, includes).

  The third bullet of the 1.0.2 note, first draft and shipped:

  ```
  - A photographed meal now carries a drawing of the dish, so logging it again still looks like food
  - Scanned meals now keep a picture of the dish
  ```

- **Replace, do not append.** The note describes this release, not the app's
  history. The previous bullets go.
- **Never name a screen or a label.** The listing is in 23 languages and the app
  speaks 13, so "Goals and targets" in Swedish points at a label no Swedish user
  can find. Say what someone does, not where they tap.
- **Take the app's own words** for anything that is named (ingredient, gram,
  food, plate) from `apps/mobile/src/i18n/en/*`, so the note and the app agree
  in the 13 the app does speak.
- **No em dashes or en dashes**, here or in any translation. Comma, full stop,
  semicolon, brackets.
- **Under 500 characters per locale.** Play truncates there without warning, and
  German and French run about 40% longer than English.
- The closing line is a short **unattributed** healthy-eating proverb, a
  different one from the note it replaces. Unattributed because a misattribution
  ships in 23 languages at once. It is translated for meaning, never left in
  English and never transliterated.

## 5. Translate into all 23 locales

Branch before the first edit, so nothing is written on `main`:

```sh
git checkout -b <a-branch-named-after-the-change>
```

The locales are `en ms zh id th vi ja ko hi fil es fr de pt it nl ru tr pl uk
sv nb da`, plus whatever the file holds if that list has grown. Edit `whatsNew` in place for
every one of them; touch no `description`.

Translate for meaning. A bullet that reads as an instruction in English reads as
one in Japanese. Where the app speaks the language, the nouns come from
`apps/mobile/src/i18n/<locale>/*` so the note matches the app's own wording;
where it does not, translate plainly.

## 6. Verify before opening anything

```sh
cd ~/Projects/ricecal-screenshots-creator
npx tsc --noEmit                       # there is no typecheck script
git diff --stat                        # appDescriptions.ts and nothing else
grep -c 'whatsNew:' src/data/appDescriptions.ts   # still 23
```

Then the two things a diff does not show. Play's 500 character cap:

```sh
node -e "
const s = require('fs').readFileSync('src/data/appDescriptions.ts', 'utf8');
const r = /^  ([a-z-]+): \{[\s\S]*?whatsNew: \`([\s\S]*?)\`,/gm;
const out = []; let m;
while ((m = r.exec(s))) out.push([m[1], m[2].length]);
out.sort((a, b) => b[1] - a[1]);
console.log(out.length + ' locales, longest ' + out[0][0] + ' at ' + out[0][1]);
const over = out.filter((x) => x[1] > 500).map((x) => x[0]);
console.log(over.length ? 'OVER 500: ' + over.join(', ') : 'all under 500');
"
```

and that no `description` moved. Grepping the diff for `description:` only sees
the line the keyword is on, and these are multi line templates, so compare the
values against `main`:

```sh
node -e "
const { execSync } = require('child_process');
const read = (t) => {
  const r = /^  ([a-z-]+): \{\s*description: \`([\s\S]*?)\`,/gm;
  const o = {}; let m;
  while ((m = r.exec(t))) o[m[1]] = m[2];
  return o;
};
const was = read(execSync('git show main:src/data/appDescriptions.ts', { encoding: 'utf8' }));
const now = read(require('fs').readFileSync('src/data/appDescriptions.ts', 'utf8'));
const moved = Object.keys({ ...was, ...now }).filter((k) => was[k] !== now[k]);
console.log(moved.length ? 'DESCRIPTION CHANGED: ' + moved.join(', ') : Object.keys(now).length + ' descriptions unchanged');
"
```

Then read the diff itself for a stray `—` or `–`; no command catches one.

## 7. Open the PR

```sh
git status --porcelain          # appDescriptions.ts and nothing else
git commit -am "<a sentence about what changed>"
git push -u origin HEAD
gh pr create --title "<the same sentence>" --body "$(cat <<'EOF'
...
EOF
)"
```

Write the body out rather than using `--fill`: it carries, in this order, the
English note in a fence, one line per covered ricecal PR with a
`[ricecal#N](https://github.com/NelsonGan/ricecal/pull/N)` link saying what it
actually did, which app version the note goes out with and whether anything in
it is ahead of that build, the longest locale and its length, and that
`description` is untouched and `tsc` is clean.

**Its last line is the one the next run reads**, after any attribution footer
or before it, as long as it starts the line:

```
Covers: ricecal#136, ricecal#137, ricecal#139
```

Put the same line at the end of the commit body too. The squash drops it there,
but the branch keeps it, and a repo that merges differently later gets it for
free.

Attribution footers are whatever the session was told to use.

## Traps

- **The two repos are separate checkouts.** Nothing in ricecal-screenshots-creator
  is a submodule of ricecal, and a `cd` in one shell does not carry. Use
  `git -C` or full paths.
- **`git log --grep='(#135)'` matches the squash subject**, which is how a PR
  number becomes a sha. A merge commit that is not a squash (there are a few
  early ones) has no `(#N)`, so a subject without one is normal and needs
  reading rather than skipping.
- **Do not touch `src/scenes/locales/*.ts`.** Those are the screenshot captions
  and share nothing with the listing but the numbers in the brand panel.
- **The note is not the description.** The description changes when the app's
  feature set does, which is rare and is a separate decision. Leaving it byte
  identical is the point of checking.
